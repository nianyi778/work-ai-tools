import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockLoadResolvedConfig = vi.fn();
const mockEnsureJiraCredentials = vi.fn();
const mockGetProjectPath = vi.fn();
const mockSetProjectPath = vi.fn();
const mockSearchIssues = vi.fn();
const mockReadIssue = vi.fn();
const mockDownloadAttachment = vi.fn();
const mockGetMyTasks = vi.fn();
const mockAddComment = vi.fn();
const mockAddCommentWithConfirmation = vi.fn();
const mockEditCommentWithConfirmation = vi.fn();

vi.mock('../config.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../config.js')>();
  return {
    ...actual,
    loadResolvedConfig: mockLoadResolvedConfig,
    ensureJiraCredentials: mockEnsureJiraCredentials,
    getProjectPath: mockGetProjectPath,
    setProjectPath: mockSetProjectPath,
  };
});

vi.mock('../jira-client.js', () => ({
  searchIssues: mockSearchIssues,
  readIssue: mockReadIssue,
  downloadAttachment: mockDownloadAttachment,
  getMyTasks: mockGetMyTasks,
  addComment: mockAddComment,
  addCommentWithConfirmation: mockAddCommentWithConfirmation,
  editCommentWithConfirmation: mockEditCommentWithConfirmation,
}));

describe('tool handlers', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mockLoadResolvedConfig.mockResolvedValue({
      jira: {
        baseUrl: 'https://example.atlassian.net',
        authMode: 'basic',
        email: 'dev@example.com',
        token: 'token',
      },
      projects: { AT: '/tmp/backend' },
      preferences: { commentMode: 'manual' },
      security: {
        maxAttachmentSizeBytes: 10485760,
        allowedMimeTypes: ['text/*'],
      },
      warnings: ['plaintext token warning'],
    });
    mockEnsureJiraCredentials.mockImplementation(() => {});
    mockGetProjectPath.mockResolvedValue('/tmp/backend');
  });

  it('handleJiraSearch returns formatted data with pagination metadata', async () => {
    mockSearchIssues.mockResolvedValue({
      query: 'text ~ "login" ORDER BY updated DESC',
      startAt: 0,
      maxResults: 10,
      total: 12,
      issues: [
        {
          key: 'AT-101',
          summary: 'Login page crashes',
          status: 'In Progress',
          assignee: 'Kai Li',
          issueType: 'Bug',
          parentKey: null,
        },
      ],
    });

    const { handleJiraSearch } = await import('./search.js');
    const result = await handleJiraSearch({ query: 'login', response_format: 'json' });

    expect(mockSearchIssues).toHaveBeenCalled();
    expect(result.data.has_more).toBe(true);
    expect(result.data.next_offset).toBe(1);
    expect(result.text).toContain('AT-101');
  });

  it('handleReadTask returns issue data and project path hint', async () => {
    mockReadIssue.mockResolvedValue({
      key: 'AT-101',
      summary: 'Login page crashes',
      descriptionPlainText: 'Crash after oauth callback',
      status: 'In Progress',
      assignee: 'Kai Li',
      issueType: 'Bug',
      priority: 'High',
      labels: ['login'],
      parent: null,
      subtasks: [],
      linkedIssues: [],
      attachments: [],
      comments: {
        enabled: false,
        startAt: 0,
        maxResults: 0,
        total: 0,
        items: [],
      },
      changelog: {
        startAt: 0,
        maxResults: 20,
        total: 0,
        items: [],
      },
    });

    const { handleReadTask } = await import('./read-task.js');
    const result = await handleReadTask({ input: 'AT-101', response_format: 'markdown' });

    expect(mockReadIssue).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ key: 'AT-101' }));
    expect(result.data.project.localPath).toBe('/tmp/backend');
    expect(result.data.project.needsUserInput).toBe(false);
    expect(result.text).toContain('Read code under /tmp/backend');
  });

  it('handleMyTasks returns paginated tasks with has_more metadata', async () => {
    mockGetMyTasks.mockResolvedValue({
      query: 'assignee = currentUser() ORDER BY updated DESC',
      startAt: 0,
      maxResults: 10,
      total: 5,
      issues: [
        {
          key: 'AT-200',
          summary: 'Fix auth bug',
          status: 'In Progress',
          assignee: 'Kai Li',
          issueType: 'Bug',
          parentKey: null,
        },
      ],
    });

    const { handleMyTasks } = await import('./my-tasks.js');
    const result = await handleMyTasks({ status: 'In Progress', response_format: 'json' });

    expect(mockGetMyTasks).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'In Progress' })
    );
    expect(result.data.has_more).toBe(true);
    expect(result.data.next_offset).toBe(1);
    expect(result.text).toContain('AT-200');
  });

  it('handleDownloadAttachment returns parsed attachment text and data', async () => {
    mockDownloadAttachment.mockResolvedValue({
      issueKey: 'AT-101',
      filename: 'report.csv',
      mimeType: 'text/csv',
      size: 512,
      encoding: 'utf8',
      content: 'col1,col2\nval1,val2',
      truncated: false,
      parsed: { format: 'csv', parser: 'python', summary: 'CSV with 2 rows' },
    });

    const { handleDownloadAttachment } = await import('./attachment.js');
    const result = await handleDownloadAttachment({ key: 'AT-101', filename: 'report.csv', response_format: 'markdown' });

    expect(mockDownloadAttachment).toHaveBeenCalledWith(
      expect.anything(),
      { key: 'AT-101', filename: 'report.csv' }
    );
    expect(result.data.attachment.parsed?.format).toBe('csv');
    expect(result.text).toContain('report.csv');
    expect(result.text).toContain('CSV with 2 rows');
  });

  it('handleDownloadAttachment throws on missing key or filename', async () => {
    const { handleDownloadAttachment } = await import('./attachment.js');
    await expect(handleDownloadAttachment({ key: '', filename: 'file.csv' })).rejects.toThrow('requires key and filename');
    await expect(handleDownloadAttachment({ key: 'AT-101', filename: '' })).rejects.toThrow('requires key and filename');
  });

  it('handleSetProjectPath saves and returns the project mapping', async () => {
    mockSetProjectPath.mockResolvedValue({ projectKey: 'AT', localPath: '/workspace/at-repo' });

    const { handleSetProjectPath } = await import('./project.js');
    const result = await handleSetProjectPath({ jiraProject: 'AT', localPath: '/workspace/at-repo' });

    expect(mockSetProjectPath).toHaveBeenCalledWith('AT', '/workspace/at-repo');
    expect(result.projectKey).toBe('AT');
    expect(result.localPath).toBe('/workspace/at-repo');
  });

  it('handleGetProjectPath returns configured path in json format', async () => {
    mockGetProjectPath.mockResolvedValue('/workspace/at-repo');

    const { handleGetProjectPath } = await import('./project.js');
    const result = await handleGetProjectPath({ jiraProject: 'AT', response_format: 'json' });

    expect(result.data.projectKey).toBe('AT');
    expect(result.data.localPath).toBe('/workspace/at-repo');
  });

  it('handleGetProjectPath returns null when path is not configured', async () => {
    mockGetProjectPath.mockResolvedValue(null);

    const { handleGetProjectPath } = await import('./project.js');
    const result = await handleGetProjectPath({ jiraProject: 'UNKNOWN', response_format: 'markdown' });

    expect(result.data.localPath).toBeNull();
    expect(result.text).toContain('no configured local path');
  });

  it('handleAddComment validates input and forwards the request', async () => {
    mockAddCommentWithConfirmation.mockResolvedValue({
      posted: false,
      requiresConfirmation: true,
      commentId: '',
      url: '',
      preview: { key: 'AT-101', body: 'Looks good' },
      mode: 'manual',
      reminder: '当前为手动确认模式。',
      confirmationToken: 'token-123',
    });

    const { handleAddComment } = await import('./comment.js');
    const result = await handleAddComment({ key: 'at-101', body: 'Looks good' });

    expect(mockAddCommentWithConfirmation).toHaveBeenCalledWith(expect.anything(), { key: 'AT-101', body: 'Looks good', confirmToken: undefined }, undefined);
    expect(result.requiresConfirmation).toBe(true);
  });

  it('handleAddComment throws on missing key or body', async () => {
    const { handleAddComment } = await import('./comment.js');
    await expect(handleAddComment({ key: '', body: 'hi' })).rejects.toThrow('requires key and body');
    await expect(handleAddComment({ key: 'AT-101', body: '' })).rejects.toThrow('requires key and body');
  });

  it('handleEditComment validates input and forwards the request', async () => {
    mockEditCommentWithConfirmation.mockResolvedValue({
      posted: false,
      requiresConfirmation: true,
      commentId: 'c-1',
      url: '',
      preview: { key: 'AT-101', commentId: 'c-1', body: 'Updated text' },
      mode: 'manual',
      confirmationToken: 'token-456',
    });

    const { handleEditComment } = await import('./comment.js');
    const result = await handleEditComment({ key: 'at-101', commentId: 'c-1', body: 'Updated text' });

    expect(mockEditCommentWithConfirmation).toHaveBeenCalledWith(
      expect.anything(),
      { key: 'AT-101', commentId: 'c-1', body: 'Updated text', confirmToken: undefined },
      undefined,
    );
    expect(result.requiresConfirmation).toBe(true);
  });

  it('handleEditComment throws on missing key, commentId, or body', async () => {
    const { handleEditComment } = await import('./comment.js');
    await expect(handleEditComment({ key: '', commentId: 'c-1', body: 'hi' })).rejects.toThrow('requires key, commentId, and body');
    await expect(handleEditComment({ key: 'AT-101', commentId: '', body: 'hi' })).rejects.toThrow('requires key, commentId, and body');
    await expect(handleEditComment({ key: 'AT-101', commentId: 'c-1', body: '' })).rejects.toThrow('requires key, commentId, and body');
  });

  it('handleAnalyzeTask parses plain key and returns bug-category workflow', async () => {
    mockReadIssue.mockResolvedValue({
      key: 'AT-101',
      summary: 'Login page crashes',
      descriptionPlainText: 'Crash after oauth callback',
      status: 'In Progress',
      assignee: 'Kai Li',
      issueType: 'Bug',
      priority: 'High',
      labels: [],
      parent: null,
      subtasks: [],
      linkedIssues: [],
      attachments: [],
      comments: { enabled: true, startAt: 0, maxResults: 10, total: 0, items: [] },
      changelog: { startAt: 0, maxResults: 5, total: 0, items: [] },
    });

    const { handleAnalyzeTask } = await import('./analyze-task.js');
    const result = await handleAnalyzeTask({ input: 'AT-101', response_format: 'markdown' });

    expect(mockReadIssue).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ key: 'AT-101', includeComments: true }));
    expect(result.data.project.localPath).toBe('/tmp/backend');
    expect(result.data.existingAnalysisCommentId).toBeNull();
    expect(result.text).toContain('category: bug');
    expect(result.text).toContain('バグ修正分析');
    expect(result.text).toContain('再現手順');
    expect(result.text).toContain('Step 2b — Baseline');
    expect(result.text).toContain('Step 2c — Implement');
  });

  it('handleAnalyzeTask parses full browse URL', async () => {
    mockReadIssue.mockResolvedValue({
      key: 'AT-202',
      summary: 'Add payment feature',
      descriptionPlainText: 'Implement Stripe integration',
      status: 'To Do',
      assignee: null,
      issueType: 'Story',
      priority: 'Medium',
      labels: [],
      parent: null,
      subtasks: [],
      linkedIssues: [],
      attachments: [],
      comments: { enabled: true, startAt: 0, maxResults: 10, total: 0, items: [] },
      changelog: { startAt: 0, maxResults: 5, total: 0, items: [] },
    });

    const { handleAnalyzeTask } = await import('./analyze-task.js');
    const result = await handleAnalyzeTask({ input: 'https://example.atlassian.net/browse/AT-202' });

    expect(mockReadIssue).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ key: 'AT-202' }));
    expect(result.text).toContain('category: story');
    expect(result.text).toContain('機能実装分析');
    expect(result.text).toContain('受け入れ条件');
  });

  it('handleAnalyzeTask detects existing analysis comment (idempotency)', async () => {
    mockReadIssue.mockResolvedValue({
      key: 'AT-303',
      summary: 'Fix null pointer',
      descriptionPlainText: 'NPE in checkout',
      status: 'Done',
      assignee: 'Kai Li',
      issueType: 'Bug',
      priority: 'High',
      labels: [],
      parent: null,
      subtasks: [],
      linkedIssues: [],
      attachments: [],
      comments: {
        enabled: true,
        startAt: 0,
        maxResults: 10,
        total: 1,
        items: [{ id: 'c-999', author: 'bot', created: '2024-01-01', updated: null, bodyPlainText: '【AT-303】バグ修正分析\n■ 根本原因...' }],
      },
      changelog: { startAt: 0, maxResults: 5, total: 0, items: [] },
    });

    const { handleAnalyzeTask } = await import('./analyze-task.js');
    const result = await handleAnalyzeTask({ input: 'AT-303', response_format: 'markdown' });

    expect(result.data.existingAnalysisCommentId).toBe('c-999');
    expect(result.text).toContain('Analysis already posted');
    expect(result.text).toContain('jira_edit_comment');
    expect(result.text).toContain('c-999');
  });

  it('handleAnalyzeTask does NOT false-positive on normal comments referencing the key', async () => {
    mockReadIssue.mockResolvedValue({
      key: 'AT-303',
      summary: 'Fix null pointer',
      descriptionPlainText: 'NPE in checkout',
      status: 'Open',
      assignee: null,
      issueType: 'Bug',
      priority: 'High',
      labels: [],
      parent: null,
      subtasks: [],
      linkedIssues: [],
      attachments: [],
      comments: {
        enabled: true,
        startAt: 0,
        maxResults: 50,
        total: 1,
        // Normal comment that references the key but is NOT an analysis comment
        items: [{ id: 'c-001', author: 'dev', created: '2024-01-01', updated: null, bodyPlainText: '参考【AT-303】の実装方針で進めます' }],
      },
      changelog: { startAt: 0, maxResults: 5, total: 0, items: [] },
    });

    const { handleAnalyzeTask } = await import('./analyze-task.js');
    const result = await handleAnalyzeTask({ input: 'AT-303', response_format: 'markdown' });

    expect(result.data.existingAnalysisCommentId).toBeNull();
    expect(result.text).not.toContain('Analysis already posted');
  });

  it('handleAnalyzeTask throws on invalid input', async () => {
    const { handleAnalyzeTask } = await import('./analyze-task.js');
    await expect(handleAnalyzeTask({ input: 'not-a-key' })).rejects.toThrow('Cannot parse issue key');
    await expect(handleAnalyzeTask({ input: '' })).rejects.toThrow('requires input');
  });

  it('handleAnalyzeTask shows linked issues and attachment download hint', async () => {
    mockReadIssue.mockResolvedValue({
      key: 'AT-404',
      summary: 'Performance regression',
      descriptionPlainText: 'Slow query',
      status: 'Open',
      assignee: null,
      issueType: 'Bug',
      priority: 'Critical',
      labels: [],
      parent: null,
      subtasks: [],
      linkedIssues: [{ key: 'AT-400', summary: 'Related perf issue', status: 'Done', relation: 'relates to' }],
      attachments: [{ filename: 'flamegraph.png', mimeType: 'image/png', size: 102400, created: null, author: null }],
      comments: { enabled: true, startAt: 0, maxResults: 10, total: 0, items: [] },
      changelog: { startAt: 0, maxResults: 5, total: 0, items: [] },
    });

    const { handleAnalyzeTask } = await import('./analyze-task.js');
    const result = await handleAnalyzeTask({ input: 'AT-404', response_format: 'markdown' });

    expect(result.text).toContain('AT-400');
    expect(result.text).toContain('relates to');
    expect(result.text).toContain('flamegraph.png');
    expect(result.text).toContain('Step 0');
    expect(result.text).toContain('jira_download_attachment');
  });
});
