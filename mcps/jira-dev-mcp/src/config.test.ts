import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearConfigCache, ensureJiraCredentials, loadResolvedConfig } from './config.js';
import { buildSearchJql, adfToPlainText } from './jira-client.js';
import type { UserConfig } from './types.js';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, readFile: vi.fn(), writeFile: vi.fn() };
});

describe('buildSearchJql', () => {
  it('wraps plain text in a text search query', () => {
    expect(buildSearchJql('login timeout')).toBe('text ~ "login timeout" ORDER BY updated DESC');
  });

  it('keeps raw jql unchanged', () => {
    expect(buildSearchJql('project = AT AND status = "In Progress"')).toBe(
      'project = AT AND status = "In Progress"'
    );
  });

  it('does not misclassify natural language containing and/or as raw jql', () => {
    expect(buildSearchJql('login and token refresh')).toBe(
      'text ~ "login and token refresh" ORDER BY updated DESC'
    );
    expect(buildSearchJql('oauth or sso')).toBe(
      'text ~ "oauth or sso" ORDER BY updated DESC'
    );
  });
});

describe('adfToPlainText', () => {
  it('flattens nested Atlassian document content', () => {
    const adf = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Root cause' }],
        },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Add retry' }],
                },
              ],
            },
          ],
        },
      ],
    };

    expect(adfToPlainText(adf)).toContain('Root cause');
    expect(adfToPlainText(adf)).toContain('- Add retry');
  });
});

describe('ensureJiraCredentials', () => {
  it('requires email in default basic auth mode', () => {
    expect(() =>
      ensureJiraCredentials({
        jira: { baseUrl: 'https://example.atlassian.net', authMode: 'basic', token: 'token' },
        projects: {},
        security: { maxAttachmentSizeBytes: 1, allowedMimeTypes: [] },
        warnings: [],
      })
    ).toThrow('Missing Jira email for basic auth');
  });
});

describe('loadResolvedConfig OAuth', () => {
  const now = Date.now();
  const baseOAuth = {
    clientId: 'client-id',
    clientSecret: 'client-secret',
    accessToken: 'access-token-old',
    refreshToken: 'refresh-token',
    expiresAt: now + 30 * 60 * 1000,
    cloudId: 'cloud-id-123',
    cloudUrl: 'https://example.atlassian.net',
  };

  const makeConfig = (overrides: Partial<typeof baseOAuth> = {}): UserConfig => ({
    jira: { authMode: 'oauth', oauth: { ...baseOAuth, ...overrides } },
    projects: {},
    security: { maxAttachmentSizeBytes: 1024, allowedMimeTypes: ['text/*'] },
  });

  let readFileMock: ReturnType<typeof vi.fn>;
  let writeFileMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    clearConfigCache();
    const fs = await import('node:fs/promises');
    readFileMock = fs.readFile as ReturnType<typeof vi.fn>;
    writeFileMock = fs.writeFile as ReturnType<typeof vi.fn>;
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    clearConfigCache();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns bearer token from OAuth config without refreshing when not expiring', async () => {
    readFileMock.mockResolvedValue(JSON.stringify(makeConfig()));

    const result = await loadResolvedConfig();

    expect(fetch).not.toHaveBeenCalled();
    expect(result.jira.authMode).toBe('bearer');
    expect(result.jira.token).toBe('access-token-old');
    expect(result.jira.baseUrl).toBe('https://api.atlassian.com/ex/jira/cloud-id-123');
  });

  it('auto-refreshes and saves token when expiring within 5 minutes', async () => {
    readFileMock.mockResolvedValue(
      JSON.stringify(makeConfig({ expiresAt: now + 2 * 60 * 1000 }))
    );
    writeFileMock.mockResolvedValue(undefined);

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ access_token: 'access-token-new', refresh_token: 'refresh-token-new', expires_in: 3600 }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );

    const result = await loadResolvedConfig();

    expect(fetch).toHaveBeenCalledWith(
      'https://auth.atlassian.com/oauth/token',
      expect.objectContaining({ method: 'POST' })
    );
    expect(result.jira.token).toBe('access-token-new');
    expect(writeFileMock).toHaveBeenCalled();
  });

  it('adds warning and returns expired token when refresh fails', async () => {
    readFileMock.mockResolvedValue(
      JSON.stringify(makeConfig({ expiresAt: now - 1000 }))
    );
    writeFileMock.mockResolvedValue(undefined);

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response('Unauthorized', { status: 401 })
    );

    const result = await loadResolvedConfig();

    expect(result.warnings.some((w) => w.includes('Token refresh failed'))).toBe(true);
    expect(result.jira.token).toBe('access-token-old');
  });
});
