import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addComment } from './jira-comment.js';
import type { ResolvedConfig } from './types.js';

const baseConfig: ResolvedConfig = {
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
    allowedMimeTypes: ['text/*', 'application/json'],
  },
  warnings: [],
};

describe('addComment auto mode ADF body conversion', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  async function postAndGetAdfContent(body: string): Promise<unknown> {
    let posted: unknown;
    global.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      posted = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ id: '1001' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    await addComment(baseConfig, { key: 'AT-101', body });
    return posted;
  }

  it('builds single paragraph when no code block exists', async () => {
    const posted = await postAndGetAdfContent('Hello Jira');
    expect(posted).toEqual({
      body: {
        type: 'doc',
        version: 1,
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello Jira' }] }],
      },
    });
  });

  it('builds multiple paragraphs separated by blank lines', async () => {
    const posted = await postAndGetAdfContent('Para 1\n\nPara 2\n\n\nPara 3');
    expect(posted).toEqual({
      body: {
        type: 'doc',
        version: 1,
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Para 1' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Para 2' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Para 3' }] },
        ],
      },
    });
  });

  it('converts fenced code block into codeBlock node', async () => {
    const posted = await postAndGetAdfContent('```\nconst x = 1;\n```');
    expect(posted).toEqual({
      body: {
        type: 'doc',
        version: 1,
        content: [{ type: 'codeBlock', content: [{ type: 'text', text: 'const x = 1;' }] }],
      },
    });
  });

  it('supports mixed paragraphs and code blocks', async () => {
    const posted = await postAndGetAdfContent('before\n\n```\nconsole.log(1);\n```\n\nafter');
    expect(posted).toEqual({
      body: {
        type: 'doc',
        version: 1,
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'before' }] },
          { type: 'codeBlock', content: [{ type: 'text', text: 'console.log(1);' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'after' }] },
        ],
      },
    });
  });

  it('captures language identifier in code block attrs', async () => {
    const posted = await postAndGetAdfContent('```typescript\nconst s: string = "ok";\n```');
    expect(posted).toEqual({
      body: {
        type: 'doc',
        version: 1,
        content: [{ type: 'codeBlock', attrs: { language: 'typescript' }, content: [{ type: 'text', text: 'const s: string = "ok";' }] }],
      },
    });
  });
});
