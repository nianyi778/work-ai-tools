import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRegisterTool = vi.fn();
const mockConnect = vi.fn();
const mockHandleAddComment = vi.fn();
const mockHandleEditComment = vi.fn();
const mockServerCtor = vi.fn(function(this: { registerTool: typeof mockRegisterTool; connect: typeof mockConnect }) {
  this.registerTool = mockRegisterTool;
  this.connect = mockConnect;
});

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: mockServerCtor,
}));

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: vi.fn(),
}));

vi.mock('./tools/search.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./tools/search.js')>();
  return { ...actual, handleJiraSearch: vi.fn().mockResolvedValue({ text: 'search result' }) };
});
vi.mock('./tools/read-task.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./tools/read-task.js')>();
  return { ...actual, handleReadTask: vi.fn().mockResolvedValue({ text: 'read result' }) };
});
vi.mock('./tools/attachment.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./tools/attachment.js')>();
  return { ...actual, handleDownloadAttachment: vi.fn().mockResolvedValue({ text: 'attachment result' }) };
});
vi.mock('./tools/my-tasks.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./tools/my-tasks.js')>();
  return { ...actual, handleMyTasks: vi.fn().mockResolvedValue({ text: 'my tasks result' }) };
});
vi.mock('./tools/project.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./tools/project.js')>();
  return {
    ...actual,
    handleSetProjectPath: vi.fn().mockResolvedValue({ projectKey: 'AT', localPath: '/tmp/at' }),
    handleGetProjectPath: vi.fn().mockResolvedValue({ text: 'project path result' }),
  };
});
vi.mock('./tools/comment.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./tools/comment.js')>();
  return { ...actual, handleAddComment: mockHandleAddComment, handleEditComment: mockHandleEditComment };
});
vi.mock('./tools/analyze-task.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./tools/analyze-task.js')>();
  return { ...actual, handleAnalyzeTask: vi.fn().mockResolvedValue({ text: 'analysis result' }) };
});

describe('createServer', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockHandleAddComment.mockResolvedValue({
      posted: true,
      requiresConfirmation: false,
      commentId: 'c-1',
      url: 'https://example/comment',
      preview: { key: 'AT-1', body: 'ok' },
      mode: 'auto',
    });
    mockHandleEditComment.mockResolvedValue({
      posted: true,
      requiresConfirmation: false,
      commentId: 'c-1',
      url: 'https://example/comment',
      preview: { key: 'AT-1', commentId: 'c-1', body: 'revised' },
      mode: 'auto',
    });
  });

  it('registers all supported tools with the expected server metadata', async () => {
    const { createServer } = await import('./index.js');
    createServer();

    expect(mockServerCtor).toHaveBeenCalledWith({ name: 'jira-dev-mcp', version: expect.any(String) });
    expect(mockRegisterTool).toHaveBeenCalledTimes(10);
    expect(mockRegisterTool.mock.calls.map((call) => call[0])).toEqual([
      'jira_search_issues',
      'jira_read_task',
      'jira_download_attachment',
      'jira_download_all_attachments',
      'jira_my_tasks',
      'jira_set_project_path',
      'jira_get_project_path',
      'jira_add_comment',
      'jira_edit_comment',
      'jira_analyze_task',
    ]);
  });

  it('wraps add/edit comment handler output into MCP text content', async () => {
    const { createServer } = await import('./index.js');
    createServer();

    const searchToolHandler = mockRegisterTool.mock.calls.find((call) => call[0] === 'jira_search_issues')?.[2];
    const commentToolHandler = mockRegisterTool.mock.calls.find((call) => call[0] === 'jira_add_comment')?.[2];
    const editCommentToolHandler = mockRegisterTool.mock.calls.find((call) => call[0] === 'jira_edit_comment')?.[2];

    await expect(searchToolHandler({ query: 'login' })).resolves.toEqual({
      content: [{ type: 'text', text: 'search result' }],
    });
    await expect(commentToolHandler({ key: 'AT-1', body: 'ok' })).resolves.toEqual({
      content: [{ type: 'text', text: 'Comment posted successfully.\n\nView comment: https://example/comment\n\nTo edit it later, use jira_edit_comment with commentId=c-1.' }],
    });
    await expect(editCommentToolHandler({ key: 'AT-1', commentId: 'c-1', body: 'revised' })).resolves.toEqual({
      content: [{ type: 'text', text: 'Comment updated successfully.\n\nView comment: https://example/comment' }],
    });
  });

  it('returns preview responses for add/edit comment confirmation flow', async () => {
    mockHandleAddComment.mockResolvedValue({
      posted: false,
      requiresConfirmation: true,
      commentId: '',
      url: '',
      preview: { key: 'AT-1', body: 'ok' },
      mode: 'manual',
      reminder: '当前为手动确认模式。',
      confirmationToken: 'token-123',
    });
    mockHandleEditComment.mockResolvedValue({
      posted: false,
      requiresConfirmation: true,
      commentId: 'c-1',
      url: '',
      preview: { key: 'AT-1', commentId: 'c-1', body: 'revised' },
      mode: 'manual',
      confirmationToken: 'token-edit',
    });

    const { createServer } = await import('./index.js');
    createServer();

    const commentToolHandler = mockRegisterTool.mock.calls.find((call) => call[0] === 'jira_add_comment')?.[2];
    const editCommentToolHandler = mockRegisterTool.mock.calls.find((call) => call[0] === 'jira_edit_comment')?.[2];

    await expect(commentToolHandler({ key: 'AT-1', body: 'ok' }, { sessionId: 'session-a' })).resolves.toEqual({
      content: [{
        type: 'text',
        text: 'Comment preview:\n\nIssue: AT-1\nBody:\nok\n\nConfirmation token: token-123\nReply with confirm_token=<token> to send this change.\n\n当前为手动确认模式。',
      }],
    });
    await expect(editCommentToolHandler({ key: 'AT-1', commentId: 'c-1', body: 'revised' }, { sessionId: 'session-b' })).resolves.toEqual({
      content: [{
        type: 'text',
        text: 'Comment edit preview:\n\nIssue: AT-1\nComment ID: c-1\nBody:\nrevised\n\nConfirmation token: token-edit\nReply with confirm_token=<token> to send this change.',
      }],
    });
  });
});
