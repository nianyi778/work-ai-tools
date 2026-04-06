/**
 * Public API surface for Jira client operations.
 *
 * All tool handlers import from this barrel module rather than reaching into
 * internal implementation files directly.  This keeps the dependency graph
 * one-directional (tools → client → http) and makes future refactors safer
 * because only this file needs updating when internals move.
 */
export { adfToPlainText } from './jira-adf.js';
export { buildSearchJql, getMyTasks, searchIssues } from './jira-search.js';
export { readIssue } from './jira-issue-read.js';
export { downloadAttachment, downloadAllAttachments } from './jira-attachment-client.js';
export { addComment, addCommentWithConfirmation, editComment, editCommentWithConfirmation } from './jira-comment.js';
export { JiraError, JiraAuthError, JiraApiError, JiraValidationError, JiraNetworkError } from './errors.js';
