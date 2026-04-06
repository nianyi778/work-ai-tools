import type { AddCommentInput, AddCommentResult, EditCommentInput, ResolvedConfig } from './types.js';
import { jiraRequest } from './jira-http.js';
import { randomUUID } from 'node:crypto';

const DEFAULT_REMINDER_CONTEXT = 'default';
const CONFIRMATION_TTL_MS = 10 * 60 * 1000;
const REMINDED_CONTEXTS_MAX = 500;
const remindedContexts = new Map<string, number>();

// In-process store for pending confirmation tokens.
// Intentionally in-memory: tokens expire after CONFIRMATION_TTL_MS (10 min) and are
// only meaningful within a single server session. If the server restarts, all pending
// tokens are cleared and the user must request a new preview — this is expected behavior.
const pendingCommentConfirmations = new Map<string, {
  action: 'add' | 'edit';
  key: string;
  commentId?: string;
  body: string;
  contextKey: string;
  expiresAt: number;
}>();

function buildContextKey(contextKey?: string): string {
  return contextKey || DEFAULT_REMINDER_CONTEXT;
}

function evictExpiredConfirmations(): void {
  const now = Date.now();
  for (const [token, pending] of pendingCommentConfirmations) {
    if (pending.expiresAt < now) {
      pendingCommentConfirmations.delete(token);
    }
  }
}

function evictLruRemindedContexts(): void {
  if (remindedContexts.size <= REMINDED_CONTEXTS_MAX) return;
  const sorted = [...remindedContexts.entries()].sort((a, b) => a[1] - b[1]);
  const toRemove = sorted.slice(0, remindedContexts.size - REMINDED_CONTEXTS_MAX);
  for (const [key] of toRemove) {
    remindedContexts.delete(key);
  }
}

function createCommentPreview(
  input: AddCommentInput | EditCommentInput,
  contextKey?: string,
  action: 'add' | 'edit' = 'add',
): AddCommentResult {
  evictExpiredConfirmations();

  const resolvedContextKey = buildContextKey(contextKey);
  const confirmationToken = randomUUID();
  pendingCommentConfirmations.set(confirmationToken, {
    action,
    key: input.key,
    commentId: 'commentId' in input ? input.commentId : undefined,
    body: input.body,
    contextKey: resolvedContextKey,
    expiresAt: Date.now() + CONFIRMATION_TTL_MS,
  });

  const hasSession = Boolean(contextKey);
  const reminder = !hasSession || !remindedContexts.has(resolvedContextKey)
    ? '手動確認モードです。コメント送信前にプレビューを表示し、確認を待ちます。auto モードに変更可能です。'
    : undefined;
  if (hasSession) {
    evictLruRemindedContexts();
    remindedContexts.set(resolvedContextKey, Date.now());
  }

  return {
    posted: false,
    requiresConfirmation: true,
    commentId: '',
    url: '',
    preview: {
      key: input.key,
      commentId: 'commentId' in input ? input.commentId : undefined,
      body: input.body,
    },
    mode: 'manual',
    reminder,
    confirmationToken,
  };
}

function buildCommentUrl(config: ResolvedConfig, issueKey: string, commentId: string): string {
  const browseBase = config.jira.browseUrl
    ?? (config.jira.baseUrl?.startsWith('https://api.atlassian.com') ? '' : config.jira.baseUrl)
    ?? '';
  return browseBase ? `${browseBase}/browse/${issueKey}?focusedCommentId=${commentId}` : '';
}

import type { AdfNode } from './jira-adf.js';

function textToParagraph(text: string): AdfNode {
  return { type: 'paragraph', content: [{ type: 'text', text }] };
}

function textToCodeBlock(code: string, language?: string): AdfNode {
  const node: AdfNode = { type: 'codeBlock', content: [{ type: 'text', text: code }] };
  if (language) node.attrs = { language };
  return node;
}

function parseTextToAdfContent(text: string): AdfNode[] {
  const nodes: AdfNode[] = [];
  const codeBlockPattern = /^```(\w*)\n([\s\S]*?)^```$/gm;
  let lastIndex = 0;

  for (const match of text.matchAll(codeBlockPattern)) {
    const before = text.slice(lastIndex, match.index);
    if (before.trim()) {
      for (const para of before.split(/\n{2,}/)) {
        const trimmed = para.trim();
        if (trimmed) nodes.push(textToParagraph(trimmed));
      }
    }
    const lang = match[1] || undefined;
    const code = match[2].replace(/\n$/, '');
    nodes.push(textToCodeBlock(code, lang));
    lastIndex = match.index! + match[0].length;
  }

  const remaining = text.slice(lastIndex);
  if (remaining.trim()) {
    for (const para of remaining.split(/\n{2,}/)) {
      const trimmed = para.trim();
      if (trimmed) nodes.push(textToParagraph(trimmed));
    }
  }

  return nodes.length > 0 ? nodes : [textToParagraph(text)];
}

function buildAdfBody(text: string) {
  return {
    body: {
      type: 'doc',
      version: 1,
      content: parseTextToAdfContent(text),
    },
  };
}

export async function addComment(
  config: ResolvedConfig,
  input: AddCommentInput,
  contextKey?: string,
): Promise<AddCommentResult> {
  const mode = config.preferences.commentMode;
  if (mode === 'manual') {
    return createCommentPreview(input, contextKey, 'add');
  }

  const data = await jiraRequest<{ id: string }>(config, `/rest/api/3/issue/${encodeURIComponent(input.key)}/comment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildAdfBody(input.body)),
  });

  return {
    posted: true,
    requiresConfirmation: false,
    commentId: data.id,
    url: buildCommentUrl(config, input.key, data.id),
    preview: {
      key: input.key,
      body: input.body,
    },
    mode,
  };
}

export async function editComment(
  config: ResolvedConfig,
  input: EditCommentInput,
  contextKey?: string,
): Promise<AddCommentResult> {
  const mode = config.preferences.commentMode;
  if (mode === 'manual') {
    return createCommentPreview(input, contextKey, 'edit');
  }

  await jiraRequest<{ id: string }>(
    config,
    `/rest/api/3/issue/${encodeURIComponent(input.key)}/comment/${encodeURIComponent(input.commentId)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildAdfBody(input.body)),
    },
  );

  return {
    posted: true,
    requiresConfirmation: false,
    commentId: input.commentId,
    url: buildCommentUrl(config, input.key, input.commentId),
    preview: {
      key: input.key,
      commentId: input.commentId,
      body: input.body,
    },
    mode,
  };
}

export async function addCommentWithConfirmation(
  config: ResolvedConfig,
  input: AddCommentInput,
  contextKey?: string,
): Promise<AddCommentResult> {
  if (config.preferences.commentMode !== 'manual' && input.confirmToken && (!input.key || !input.body)) {
    throw new Error('confirm_token は manual モード専用です。auto モードでは key と body を直接指定してください。');
  }

  if (config.preferences.commentMode === 'manual') {
    if (!input.confirmToken) {
      return createCommentPreview(input, contextKey, 'add');
    }

    const pending = pendingCommentConfirmations.get(input.confirmToken);
    if (!pending || pending.expiresAt < Date.now()) {
      pendingCommentConfirmations.delete(input.confirmToken);
      if (input.key && input.body) {
        return createCommentPreview(input, contextKey, 'add');
      }
      throw new Error('Confirmation token expired and no key/body provided to create a new preview.');
    }

    if (pending.action !== 'add') {
      pendingCommentConfirmations.delete(input.confirmToken);
      throw new Error('Confirmation token is for an edit, not an add. Please request a new preview.');
    }

    // Token-only confirm: use the stored key/body from the pending preview
    pendingCommentConfirmations.delete(input.confirmToken);
    input = { key: pending.key, body: pending.body };
  }

  const nextConfig = config.preferences.commentMode === 'manual'
    ? {
        ...config,
        preferences: {
          ...config.preferences,
          commentMode: 'auto' as const,
        },
      }
    : config;
  return addComment(nextConfig, input, contextKey);
}

export async function editCommentWithConfirmation(
  config: ResolvedConfig,
  input: EditCommentInput,
  contextKey?: string,
): Promise<AddCommentResult> {
  if (config.preferences.commentMode !== 'manual' && input.confirmToken && (!input.key || !input.commentId || !input.body)) {
    throw new Error('confirm_token は manual モード専用です。auto モードでは key・commentId・body を直接指定してください。');
  }

  if (config.preferences.commentMode === 'manual') {
    if (!input.confirmToken) {
      return createCommentPreview(input, contextKey, 'edit');
    }

    const pending = pendingCommentConfirmations.get(input.confirmToken);
    if (!pending || pending.expiresAt < Date.now()) {
      pendingCommentConfirmations.delete(input.confirmToken);
      if (input.key && input.commentId && input.body) {
        return createCommentPreview(input, contextKey, 'edit');
      }
      throw new Error('Confirmation token expired and no key/commentId/body provided to create a new preview.');
    }

    if (pending.action !== 'edit') {
      pendingCommentConfirmations.delete(input.confirmToken);
      throw new Error('Confirmation token is for an add, not an edit. Please request a new preview.');
    }

    // Token-only confirm: use the stored key/commentId/body from the pending preview
    pendingCommentConfirmations.delete(input.confirmToken);
    if (!pending.commentId) {
      throw new Error('Internal error: edit token is missing commentId.');
    }
    input = { key: pending.key, commentId: pending.commentId, body: pending.body };
  }

  const nextConfig = config.preferences.commentMode === 'manual'
    ? {
        ...config,
        preferences: {
          ...config.preferences,
          commentMode: 'auto' as const,
        },
      }
    : config;
  return editComment(nextConfig, input, contextKey);
}
