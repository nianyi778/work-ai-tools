import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResolvedConfig } from './types.js';

// --- module mocks ---

const mockGetIssue = vi.fn();
vi.mock('./jira-issue-read.js', () => ({ getIssue: mockGetIssue }));

const mockMatchesMimeType = vi.fn();
const mockBuildAuthHeader = vi.fn();
const mockIsTextMimeType = vi.fn();
const mockFetchWithRetry = vi.fn();
vi.mock('./jira-http.js', () => ({
  matchesMimeType: mockMatchesMimeType,
  buildAuthHeader: mockBuildAuthHeader,
  isTextMimeType: mockIsTextMimeType,
  fetchWithRetry: mockFetchWithRetry,
}));

vi.mock('./jira-attachment.js', () => ({
  parseAttachmentWithPython: vi.fn().mockResolvedValue(null),
  truncateText: vi.fn((text: string) => ({ content: text, truncated: false })),
  MAX_INLINE_ATTACHMENT_BYTES: 1_048_576,
  PARSEABLE_ATTACHMENT_MIME_TYPES: new Set<string>(),
}));

// --- helpers ---

const baseConfig: ResolvedConfig = {
  jira: { baseUrl: 'https://example.atlassian.net', authMode: 'basic', email: 'dev@example.com', token: 'tok' },
  projects: {},
  preferences: { commentMode: 'manual' },
  security: { maxAttachmentSizeBytes: 10_000_000, allowedMimeTypes: ['*'] },
  warnings: [],
};

function makeAttachment(filename: string, mimeType: string, size = 100) {
  return { filename, mimeType, size, content: `https://files.example.com/${filename}` };
}

function makeIssue(attachments: ReturnType<typeof makeAttachment>[]) {
  return { key: 'AT-1', fields: { attachment: attachments } };
}

// --- tests ---

describe('downloadAllAttachments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBuildAuthHeader.mockReturnValue('Basic tok');
    mockMatchesMimeType.mockReturnValue(true);
    mockIsTextMimeType.mockReturnValue(true);
    mockFetchWithRetry.mockResolvedValue({
      arrayBuffer: async () => Buffer.from('content').buffer,
    });
  });

  it('returns empty list when issue has no attachments', async () => {
    mockGetIssue.mockResolvedValue(makeIssue([]));
    const { downloadAllAttachments } = await import('./jira-attachment-client.js');
    const result = await downloadAllAttachments(baseConfig, { key: 'AT-1' });
    expect(result.attachments).toHaveLength(0);
    expect(mockFetchWithRetry).not.toHaveBeenCalled();
  });

  it('downloads all attachments when no mimeFilter is set', async () => {
    mockGetIssue.mockResolvedValue(makeIssue([
      makeAttachment('photo.png', 'image/png'),
      makeAttachment('notes.txt', 'text/plain'),
    ]));
    const { downloadAllAttachments } = await import('./jira-attachment-client.js');
    const result = await downloadAllAttachments(baseConfig, { key: 'AT-1' });
    expect(result.attachments).toHaveLength(2);
  });

  it('mimeFilter: only downloads attachments whose mimeType starts with the prefix', async () => {
    mockGetIssue.mockResolvedValue(makeIssue([
      makeAttachment('photo.png', 'image/png'),
      makeAttachment('notes.txt', 'text/plain'),
      makeAttachment('chart.jpg', 'image/jpeg'),
    ]));
    const { downloadAllAttachments } = await import('./jira-attachment-client.js');
    const result = await downloadAllAttachments(baseConfig, { key: 'AT-1', mimeFilter: 'image/' });

    expect(result.attachments).toHaveLength(2);
    expect(result.attachments.map((a) => a.filename)).toEqual(['photo.png', 'chart.jpg']);
    // text/plain must never be fetched
    const fetchedUrls = mockFetchWithRetry.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(fetchedUrls.every((u) => !u.includes('notes.txt'))).toBe(true);
  });

  it('mimeFilter is case-insensitive (pattern and mimeType both lowercased)', async () => {
    mockGetIssue.mockResolvedValue(makeIssue([
      makeAttachment('Doc.PDF', 'Application/PDF'),
      makeAttachment('img.png', 'image/png'),
    ]));
    const { downloadAllAttachments } = await import('./jira-attachment-client.js');
    const result = await downloadAllAttachments(baseConfig, { key: 'AT-1', mimeFilter: 'application/' });

    expect(result.attachments).toHaveLength(1);
    expect(result.attachments[0].filename).toBe('Doc.PDF');
  });

  it('mimeFilter with wildcard-style input (e.g. "image/*") does NOT match — prefix required', async () => {
    // The old code stripped "*" via pattern.replace('*', '').
    // The new code uses the pattern as-is: "image/*" will never startsWith-match "image/png".
    // Callers must pass a clean prefix like "image/", not "image/*".
    mockGetIssue.mockResolvedValue(makeIssue([
      makeAttachment('photo.png', 'image/png'),
    ]));
    const { downloadAllAttachments } = await import('./jira-attachment-client.js');
    const result = await downloadAllAttachments(baseConfig, { key: 'AT-1', mimeFilter: 'image/*' });

    // "image/png".startsWith("image/*") === false — zero attachments pass the filter
    expect(result.attachments).toHaveLength(0);
  });

  it('withConcurrencyLimit: no more than 5 downloads run simultaneously', async () => {
    const attachments = Array.from({ length: 10 }, (_, i) =>
      makeAttachment(`file${i}.txt`, 'text/plain', 50),
    );
    mockGetIssue.mockResolvedValue(makeIssue(attachments));

    let current = 0;
    let maxConcurrent = 0;
    mockFetchWithRetry.mockImplementation(async () => {
      current++;
      maxConcurrent = Math.max(maxConcurrent, current);
      // Simulate async work so multiple workers can overlap
      await new Promise<void>((r) => setTimeout(r, 5));
      current--;
      return { arrayBuffer: async () => Buffer.from('x').buffer };
    });

    const { downloadAllAttachments } = await import('./jira-attachment-client.js');
    const result = await downloadAllAttachments(baseConfig, { key: 'AT-1' });

    expect(result.attachments).toHaveLength(10);
    expect(maxConcurrent).toBeGreaterThan(1);    // actually runs in parallel
    expect(maxConcurrent).toBeLessThanOrEqual(5); // but capped at 5
  });
});
