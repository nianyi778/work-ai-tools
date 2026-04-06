import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithRetry } from './jira-http.js';
import { JiraApiError, JiraAuthError, JiraNetworkError } from './errors.js';

describe('fetchWithRetry', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    global.fetch = originalFetch;
  });

  it('retries retryable responses before succeeding', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('busy', { status: 503 }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));

    const response = await fetchWithRetry('https://files.example/report.txt', undefined, {
      requestLabel: 'Attachment download',
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(await response.text()).toBe('ok');
  });

  it('uses Retry-After header value as retry delay for 429 responses', async () => {
    const delays: number[] = [];
    const realSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = ((fn: (...args: unknown[]) => void, ms?: number) => {
      if (ms !== undefined) delays.push(ms);
      return realSetTimeout(fn, 0);
    }) as typeof globalThis.setTimeout;

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('too many requests', { status: 429, headers: { 'retry-after': '2' } }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));

    const response = await fetchWithRetry('https://api.example.com/issues', undefined, {
      requestLabel: 'Jira API',
    });

    globalThis.setTimeout = realSetTimeout;
    expect(delays).toContain(2000);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(await response.text()).toBe('ok');
  });

  it('throws JiraAuthError for 401 response', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('unauthorized', { status: 401 }));

    await expect(fetchWithRetry('https://api.example.com/issues')).rejects.toBeInstanceOf(JiraAuthError);
  });

  it('throws JiraAuthError for 403 response', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('forbidden', { status: 403 }));

    await expect(fetchWithRetry('https://api.example.com/issues')).rejects.toBeInstanceOf(JiraAuthError);
  });

  it('throws JiraApiError for non-retryable error responses', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('not found', { status: 404 }));

    await expect(fetchWithRetry('https://api.example.com/issues')).rejects.toBeInstanceOf(JiraApiError);
  });

  it('wraps network failures in JiraNetworkError', async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount <= 1) {
        throw new Error('socket hang up');
      }
      return new Response('ok', { status: 200 });
    });

    const response = await fetchWithRetry('https://api.example.com/issues', undefined, {
      requestLabel: 'Test',
    });
    expect(await response.text()).toBe('ok');
    expect(callCount).toBe(2);
  });

  it('JiraNetworkError preserves cause after all retries fail', async () => {
    const cause = new Error('ECONNREFUSED');
    const error = new JiraNetworkError('network error: ECONNREFUSED', cause);
    expect(error).toBeInstanceOf(JiraNetworkError);
    expect(error.name).toBe('JiraNetworkError');
    expect(error.message).toContain('ECONNREFUSED');
    expect(error.cause).toBe(cause);
  });
});
