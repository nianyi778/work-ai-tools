import type { ResolvedConfig } from './types.js';
import { JiraApiError, JiraAuthError, JiraNetworkError } from './errors.js';

export function buildAuthHeader(config: ResolvedConfig): string {
  if (config.jira.authMode === 'basic') {
    return `Basic ${Buffer.from(`${config.jira.email}:${config.jira.token}`).toString('base64')}`;
  }
  return `Bearer ${config.jira.token}`;
}

export function sanitizeErrorBody(text: string): string {
  if (!text) { return ''; }
  return text
    .replace(/[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '[redacted-jwt]')
    .replace(/[A-Za-z0-9_\-]{20,}/g, '[redacted]')
    .slice(0, 500);
}

export function matchesMimeType(mimeType: string, allowed: string[]): boolean {
  return allowed.some((pattern) => {
    if (pattern.endsWith('/*')) {
      return mimeType.startsWith(pattern.slice(0, -1));
    }
    return mimeType === pattern;
  });
}

export function isTextMimeType(mimeType: string): boolean {
  return mimeType.startsWith('text/') || mimeType === 'application/json' || mimeType.endsWith('+json');
}

const RETRYABLE_STATUSES = new Set([429, 503]);
const MAX_RETRIES = 2;
const DEFAULT_BACKOFF_BASE_MS = 1000;

function parseRetryAfterMs(response: Response): number | null {
  const header = response.headers.get('retry-after');
  if (!header) return null;
  const seconds = Number(header);
  if (!Number.isNaN(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, 120_000);
  }
  const date = Date.parse(header);
  if (!Number.isNaN(date)) {
    return Math.min(Math.max(date - Date.now(), 0), 120_000);
  }
  return null;
}

export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  options?: { timeoutMs?: number; requestLabel?: string },
): Promise<Response> {
  let lastError: Error | null = null;
  let retryAfterMs: number | null = null;
  const timeoutMs = options?.timeoutMs ?? 30_000;
  const requestLabel = options?.requestLabel ?? 'Request';

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = retryAfterMs ?? Math.pow(2, attempt - 1) * DEFAULT_BACKOFF_BASE_MS;
      await new Promise((resolve) => setTimeout(resolve, delay));
      retryAfterMs = null;
    }

    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const cause = error instanceof Error ? error : new Error(String(error));
      lastError = new JiraNetworkError(`${requestLabel} network error: ${cause.message}`, cause);
      continue;
    }

    if (RETRYABLE_STATUSES.has(response.status)) {
      retryAfterMs = parseRetryAfterMs(response);
      const body = sanitizeErrorBody(await response.text());
      lastError = new JiraApiError(response.status, body, requestLabel);
      continue;
    }

    if (!response.ok) {
      const body = sanitizeErrorBody(await response.text());
      if (response.status === 401 || response.status === 403) {
        throw new JiraAuthError(`${requestLabel} authentication failed (${response.status}): ${body}`);
      }
      throw new JiraApiError(response.status, body, requestLabel);
    }

    return response;
  }

  throw lastError ?? new Error(`${requestLabel} failed after retries`);
}

export async function jiraRequest<T>(config: ResolvedConfig, path: string, init?: RequestInit): Promise<T> {
  const response = await fetchWithRetry(`${config.jira.baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: buildAuthHeader(config),
      Accept: 'application/json',
      ...(init?.headers || {}),
    },
  }, {
    timeoutMs: 30_000,
    requestLabel: 'Jira API',
  });

  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new JiraApiError(response.status, `Non-JSON response for ${path}: ${sanitizeErrorBody(text)}`, 'Jira API');
  }
}
