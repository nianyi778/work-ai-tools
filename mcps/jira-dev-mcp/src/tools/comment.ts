import { z } from 'zod';
import { ensureJiraCredentials, loadResolvedConfig } from '../config.js';
import { addCommentWithConfirmation, editCommentWithConfirmation } from '../jira-client.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { ServerNotification, ServerRequest } from '@modelcontextprotocol/sdk/types.js';

const _addCommentBase = z.object({
  key: z.string().optional().describe('Jira issue key (e.g. AT-123). Required for new comments, optional when confirming with confirm_token.'),
  body: z.string().optional().describe('Comment text (plain text, will be wrapped in ADF paragraph). Required for new comments, optional when confirming with confirm_token.'),
  confirm_token: z.string().optional().describe('Confirmation token from preview step. When provided, key and body are optional — the pending comment content is used.'),
});
export const addCommentSchema = _addCommentBase.refine(
  (d) => d.confirm_token || (d.key && d.body),
  { message: 'jira_add_comment requires key and body (or confirm_token to confirm a pending comment)' },
);
export const addCommentSchemaShape = _addCommentBase.shape;

const _editCommentBase = z.object({
  key: z.string().optional().describe('Jira issue key (e.g. AT-123). Required for new edits, optional when confirming with confirm_token.'),
  commentId: z.string().optional().describe('Existing Jira comment id. Required for new edits, optional when confirming with confirm_token.'),
  body: z.string().optional().describe('Updated comment text (plain text, will be wrapped in ADF paragraph). Required for new edits, optional when confirming with confirm_token.'),
  confirm_token: z.string().optional().describe('Confirmation token from preview step. When provided, key/commentId/body are optional — the pending content is used.'),
});
export const editCommentSchema = _editCommentBase.refine(
  (d) => d.confirm_token || (d.key && d.commentId && d.body),
  { message: 'jira_edit_comment requires key, commentId, and body (or confirm_token to confirm a pending edit)' },
);
export const editCommentSchemaShape = _editCommentBase.shape;

export async function handleAddComment(
  args: unknown,
  extra?: RequestHandlerExtra<ServerRequest, ServerNotification>,
) {
  const { key: rawKey, body: rawBody, confirm_token } = addCommentSchema.parse(args);
  const key = rawKey?.trim().toUpperCase();
  const body = rawBody?.trim();

  const config = await loadResolvedConfig();
  ensureJiraCredentials(config);

  return addCommentWithConfirmation(config, { key: key ?? '', body: body ?? '', confirmToken: confirm_token?.trim() }, extra?.sessionId);
}

export async function handleEditComment(
  args: unknown,
  extra?: RequestHandlerExtra<ServerRequest, ServerNotification>,
) {
  const { key: rawKey, commentId: rawCommentId, body: rawBody, confirm_token } = editCommentSchema.parse(args);
  const key = rawKey?.trim().toUpperCase();
  const commentId = rawCommentId?.trim();
  const body = rawBody?.trim();

  const config = await loadResolvedConfig();
  ensureJiraCredentials(config);

  return editCommentWithConfirmation(config, { key: key ?? '', commentId: commentId ?? '', body: body ?? '', confirmToken: confirm_token?.trim() }, extra?.sessionId);
}
