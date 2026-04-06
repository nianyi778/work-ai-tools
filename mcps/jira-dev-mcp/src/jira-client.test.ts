import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addComment, addCommentWithConfirmation, downloadAttachment, editCommentWithConfirmation, getMyTasks, readIssue, searchIssues } from './jira-client.js';
import type { ResolvedConfig } from './types.js';

const config: ResolvedConfig = {
  jira: {
    baseUrl: 'https://example.atlassian.net',
    authMode: 'basic',
    email: 'dev@example.com',
    token: 'token-123',
  },
  projects: {},
  preferences: {
    commentMode: 'auto',
  },
  security: {
    maxAttachmentSizeBytes: 10 * 1024 * 1024,
    allowedMimeTypes: [
      'text/*',
      'application/json',
      'application/pdf',
      'image/*',
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.oasis.opendocument.spreadsheet',
    ],
  },
  warnings: [],
};

function jsonResponse(payload: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

describe('jira-client integration', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('searchIssues returns paginated issue summaries', async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).toContain('/rest/api/3/search?');
      expect(url).toContain('text+%7E+%22login+bug%22');
      return jsonResponse({
        startAt: 0,
        maxResults: 2,
        total: 3,
        issues: [
          {
            id: '10001',
            key: 'AT-101',
            fields: {
              summary: 'Login page crashes',
              status: { name: 'In Progress' },
              assignee: { displayName: 'Kai Li' },
              issuetype: { name: 'Bug' },
              parent: { key: 'AT-100' },
            },
          },
          {
            id: '10002',
            key: 'AT-102',
            fields: {
              summary: 'Token refresh issue',
              status: { name: 'To Do' },
              assignee: null,
              issuetype: { name: 'Task' },
            },
          },
        ],
      });
    }) as typeof fetch;

    const result = await searchIssues(config, { query: 'login bug', maxResults: 2, startAt: 0 });
    expect(result.total).toBe(3);
    expect(result.issues).toHaveLength(2);
    expect(result.issues[0]).toMatchObject({
      key: 'AT-101',
      summary: 'Login page crashes',
      status: 'In Progress',
      assignee: 'Kai Li',
      issueType: 'Bug',
      parentKey: 'AT-100',
    });
  });

  it('uses Jira Cloud basic auth by default', async () => {
    global.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get('Authorization')).toBe(`Basic ${Buffer.from('dev@example.com:token-123').toString('base64')}`);
      return jsonResponse({ startAt: 0, maxResults: 1, total: 0, issues: [] });
    }) as typeof fetch;

    await searchIssues(config, { query: 'login', maxResults: 1, startAt: 0 });
  });

  it('still supports optional bearer auth when configured', async () => {
    global.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get('Authorization')).toBe('Bearer token-123');
      return jsonResponse({ startAt: 0, maxResults: 1, total: 0, issues: [] });
    }) as typeof fetch;

    await searchIssues(
      {
        ...config,
        jira: {
          baseUrl: 'https://example.atlassian.net',
          authMode: 'bearer',
          token: 'token-123',
        },
      },
      { query: 'login', maxResults: 1, startAt: 0 }
    );
  });

  it('readIssue loads issue details, comments, attachments, and changelog', async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/rest/api/3/issue/AT-101/comment')) {
        return jsonResponse({
          startAt: 0,
          maxResults: 20,
          total: 1,
          comments: [
            {
              id: 'c1',
              created: '2026-03-30T08:00:00.000Z',
              updated: '2026-03-30T08:10:00.000Z',
              author: { displayName: 'Reviewer' },
              body: {
                type: 'doc',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Please verify retry logic' }],
                  },
                ],
              },
            },
          ],
        });
      }

      if (url.includes('/rest/api/3/issue/AT-101?')) {
        return jsonResponse({
          id: '10001',
          key: 'AT-101',
          fields: {
            summary: 'Login page crashes',
            description: {
              type: 'doc',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Crash happens after oauth callback.' }],
                },
              ],
            },
            status: { name: 'In Progress' },
            assignee: { displayName: 'Kai Li' },
            issuetype: { name: 'Bug' },
            priority: { name: 'High' },
            labels: ['login', 'oauth'],
            parent: { key: 'AT-100', fields: { summary: 'Auth improvements' } },
            subtasks: [
              {
                key: 'AT-111',
                fields: {
                  summary: 'Add retry',
                  status: { name: 'Done' },
                  assignee: { displayName: 'Kai Li' },
                },
              },
            ],
            attachment: [
              {
                id: 'a1',
                filename: 'error-log.txt',
                mimeType: 'text/plain',
                size: 120,
                content: 'https://files.example/error-log.txt',
                created: '2026-03-30T07:00:00.000Z',
                author: { displayName: 'Kai Li' },
              },
            ],
          },
          changelog: {
            histories: [
              {
                id: 'h1',
                created: '2026-03-30T06:00:00.000Z',
                author: { displayName: 'Kai Li' },
                items: [{ field: 'status', fromString: 'To Do', toString: 'In Progress' }],
              },
            ],
          },
        });
      }

      throw new Error(`Unexpected URL: ${url}`);
    }) as typeof fetch;

    const result = await readIssue(config, {
      key: 'AT-101',
      includeComments: true,
      commentStartAt: 0,
      commentMaxResults: 20,
      changelogStartAt: 0,
      changelogMaxResults: 20,
    });

    expect(result.descriptionPlainText).toContain('oauth callback');
    expect(result.attachments[0]).toMatchObject({
      filename: 'error-log.txt',
      mimeType: 'text/plain',
      size: 120,
    });
    expect(result.comments.enabled).toBe(true);
    expect(result.comments.items[0].id).toBe('c1');
    expect(result.comments.items[0].bodyPlainText).toContain('Please verify retry logic');
    expect(result.changelog.items[0].items[0]).toMatchObject({
      field: 'status',
      from: 'To Do',
      to: 'In Progress',
    });
  });

  it('downloadAttachment enforces metadata fetch and downloads content safely', async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/rest/api/3/issue/AT-101?')) {
        return jsonResponse({
          id: '10001',
          key: 'AT-101',
          fields: {
            summary: 'Login page crashes',
            attachment: [
              {
                id: 'a1',
                filename: 'error-log.txt',
                mimeType: 'text/plain',
                size: 24,
                content: 'https://files.example/error-log.txt',
              },
            ],
          },
          changelog: { histories: [] },
        });
      }

      if (url === 'https://files.example/error-log.txt') {
        return new Response('stacktrace line 1', {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        });
      }

      throw new Error(`Unexpected URL: ${url}`);
    }) as typeof fetch;

    const result = await downloadAttachment(config, { key: 'AT-101', filename: 'error-log.txt' });
    expect(result).toMatchObject({
      issueKey: 'AT-101',
      filename: 'error-log.txt',
      mimeType: 'text/plain',
      encoding: 'utf8',
      content: 'stacktrace line 1',
      truncated: false,
    });
  });

  it('downloadAttachment retries transient attachment download failures', async () => {
    let attachmentFetchCount = 0;
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/rest/api/3/issue/AT-101?')) {
        return jsonResponse({
          id: '10001',
          key: 'AT-101',
          fields: {
            summary: 'Login page crashes',
            attachment: [
              {
                id: 'a1',
                filename: 'error-log.txt',
                mimeType: 'text/plain',
                size: 24,
                content: 'https://files.example/error-log.txt',
              },
            ],
          },
          changelog: { histories: [] },
        });
      }

      if (url === 'https://files.example/error-log.txt') {
        attachmentFetchCount++;
        if (attachmentFetchCount === 1) {
          return new Response('busy', { status: 503 });
        }
        return new Response('stacktrace line 2', {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        });
      }

      throw new Error(`Unexpected URL: ${url}`);
    }) as typeof fetch;

    const result = await downloadAttachment(config, { key: 'AT-101', filename: 'error-log.txt' });
    expect(attachmentFetchCount).toBe(2);
    expect(result.content).toBe('stacktrace line 2');
  });

  it('getMyTasks builds a currentUser JQL query', async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const parsed = new URL(url);
      expect(parsed.searchParams.get('jql')).toBe('assignee = currentUser() AND status = "In Progress" ORDER BY updated DESC');
      return jsonResponse({
        startAt: 0,
        maxResults: 1,
        total: 1,
        issues: [
          {
            id: '20001',
            key: 'AT-200',
            fields: {
              summary: 'Fix auth bug',
              status: { name: 'In Progress' },
              assignee: { displayName: 'Kai Li' },
              issuetype: { name: 'Bug' },
            },
          },
        ],
      });
    }) as typeof fetch;

    const result = await getMyTasks(config, { status: 'In Progress', maxResults: 1, startAt: 0 });
    expect(result.issues[0].key).toBe('AT-200');
  });

  it('addComment posts adf and returns a browse url', async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      expect(url).toContain('/rest/api/3/issue/AT-101/comment');
      expect(init?.method).toBe('POST');
      expect(init?.body).toBe(JSON.stringify({
        body: {
          type: 'doc',
          version: 1,
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Please verify in staging' }] }],
        },
      }));
      return jsonResponse({ id: '1001' });
    }) as typeof fetch;

    const result = await addComment(config, { key: 'AT-101', body: 'Please verify in staging' });
    expect(result).toEqual({
      posted: true,
      requiresConfirmation: false,
      commentId: '1001',
      url: 'https://example.atlassian.net/browse/AT-101?focusedCommentId=1001',
      preview: {
        key: 'AT-101',
        body: 'Please verify in staging',
      },
      mode: 'auto',
    });
  });

  it('returns a preview in manual mode until confirmed', async () => {
    global.fetch = vi.fn() as typeof fetch;

    const result = await addCommentWithConfirmation(
      {
        ...config,
        preferences: { commentMode: 'manual' },
      },
      { key: 'AT-101', body: 'Looks good to me' },
      'session-a',
    );

    expect(global.fetch).not.toHaveBeenCalled();
    expect(result.posted).toBe(false);
    expect(result.requiresConfirmation).toBe(true);
    expect(result.preview.body).toBe('Looks good to me');
    expect(result.reminder).toContain('手動確認モード');
    expect(result.confirmationToken).toBeTruthy();
  });

  it('requires a matching confirmation token before posting in manual mode', async () => {
    let called = 0;
    global.fetch = vi.fn(async () => {
      called++;
      return jsonResponse({ id: '1002' });
    }) as typeof fetch;

    const manualConfig = {
      ...config,
      preferences: { commentMode: 'manual' as const },
    };
    const preview = await addCommentWithConfirmation(
      manualConfig,
      { key: 'AT-101', body: 'Ship it' },
      'session-b',
    );
    expect(preview.posted).toBe(false);

    const confirmed = await addCommentWithConfirmation(
      manualConfig,
      { key: 'AT-101', body: 'Ship it', confirmToken: preview.confirmationToken },
      'session-b',
    );

    expect(called).toBe(1);
    expect(confirmed.posted).toBe(true);
    expect(confirmed.commentId).toBe('1002');
  });

  it('edits a comment after manual confirmation with matching token', async () => {
    global.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe('PUT');
      return jsonResponse({ id: 'c9' });
    }) as typeof fetch;

    const manualConfig = {
      ...config,
      preferences: { commentMode: 'manual' as const },
    };
    const preview = await editCommentWithConfirmation(
      manualConfig,
      { key: 'AT-101', commentId: 'c9', body: 'Edited body' },
      'session-edit',
    );
    expect(preview.posted).toBe(false);
    expect(preview.preview.commentId).toBe('c9');

    const confirmed = await editCommentWithConfirmation(
      manualConfig,
      { key: 'AT-101', commentId: 'c9', body: 'Edited body', confirmToken: preview.confirmationToken },
      'session-edit',
    );
    expect(confirmed.posted).toBe(true);
    expect(confirmed.commentId).toBe('c9');
    expect(confirmed.url).toContain('focusedCommentId=c9');
  });
});
