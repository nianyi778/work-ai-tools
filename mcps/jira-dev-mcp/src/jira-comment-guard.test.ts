import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResolvedConfig } from './types.js';

const mockJiraRequest = vi.fn();
vi.mock('./jira-http.js', () => ({ jiraRequest: mockJiraRequest }));

const autoConfig: ResolvedConfig = {
  jira: { baseUrl: 'https://example.atlassian.net', authMode: 'basic', email: 'dev@example.com', token: 'tok' },
  projects: {},
  preferences: { commentMode: 'auto' },
  security: { maxAttachmentSizeBytes: 10_000_000, allowedMimeTypes: ['*'] },
  warnings: [],
};

describe('addCommentWithConfirmation — auto mode guard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws when confirm_token is supplied without key in auto mode', async () => {
    const { addCommentWithConfirmation } = await import('./jira-comment.js');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(
      addCommentWithConfirmation(autoConfig, { confirmToken: 'tok-abc', body: 'hello' } as any),
    ).rejects.toThrow('confirm_token は manual モード専用です');
  });

  it('throws when confirm_token is supplied without body in auto mode', async () => {
    const { addCommentWithConfirmation } = await import('./jira-comment.js');
    await expect(
      addCommentWithConfirmation(autoConfig, { confirmToken: 'tok-abc', key: 'AT-1' } as any),
    ).rejects.toThrow('confirm_token は manual モード専用です');
  });

  it('does NOT throw when all required fields are present with confirm_token in auto mode', async () => {
    // Guard is satisfied; function proceeds to post the comment
    mockJiraRequest.mockResolvedValue({ id: 'c-1', self: 'https://example.atlassian.net/rest/api/3/issue/AT-1/comment/c-1' });
    const { addCommentWithConfirmation } = await import('./jira-comment.js');
    await expect(
      addCommentWithConfirmation(autoConfig, { confirmToken: 'tok-abc', key: 'AT-1', body: 'hello' }),
    ).resolves.toBeDefined();
  });

  it('does NOT guard (no throw) when commentMode is manual and confirm_token is missing', async () => {
    const manualConfig: ResolvedConfig = { ...autoConfig, preferences: { commentMode: 'manual' } };
    const { addCommentWithConfirmation } = await import('./jira-comment.js');
    // manual mode, no confirm_token → returns preview (no HTTP call needed)
    const result = await addCommentWithConfirmation(manualConfig, { key: 'AT-1', body: 'hello' });
    expect(result.requiresConfirmation).toBe(true);
    expect(mockJiraRequest).not.toHaveBeenCalled();
  });
});

describe('editCommentWithConfirmation — auto mode guard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws when confirm_token is supplied without key in auto mode', async () => {
    const { editCommentWithConfirmation } = await import('./jira-comment.js');
    await expect(
      editCommentWithConfirmation(autoConfig, { confirmToken: 'tok-abc', commentId: 'c-1', body: 'updated' } as any),
    ).rejects.toThrow('confirm_token は manual モード専用です');
  });

  it('throws when confirm_token is supplied without commentId in auto mode', async () => {
    const { editCommentWithConfirmation } = await import('./jira-comment.js');
    await expect(
      editCommentWithConfirmation(autoConfig, { confirmToken: 'tok-abc', key: 'AT-1', body: 'updated' } as any),
    ).rejects.toThrow('confirm_token は manual モード専用です');
  });

  it('throws when confirm_token is supplied without body in auto mode', async () => {
    const { editCommentWithConfirmation } = await import('./jira-comment.js');
    await expect(
      editCommentWithConfirmation(autoConfig, { confirmToken: 'tok-abc', key: 'AT-1', commentId: 'c-1' } as any),
    ).rejects.toThrow('confirm_token は manual モード専用です');
  });
});
