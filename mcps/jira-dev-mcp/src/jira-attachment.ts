import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import type { DownloadedAttachment } from './types.js';

const execFileAsync = promisify(execFile);

export const MAX_INLINE_ATTACHMENT_BYTES = 1024 * 1024;
export const PARSEABLE_ATTACHMENT_MIME_TYPES = new Set([
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/pdf',
]);

let parserDependenciesInstalled = false;

export function truncateText(text: string, maxBytes: number): { content: string; truncated: boolean } {
  const buffer = Buffer.from(text, 'utf8');
  if (buffer.length <= maxBytes) {
    return { content: text, truncated: false };
  }
  return {
    content: `${buffer.subarray(0, maxBytes).toString('utf8')}\n... (truncated, total ${buffer.length} bytes)`,
    truncated: true,
  };
}

const PYTHON_PARSE_TIMEOUT_MS = 30_000;
const PYTHON_PIP_TIMEOUT_MS = 120_000;

async function installParserDependencies(): Promise<void> {
  if (parserDependenciesInstalled) { return; }
  const requirementsPath = new URL('../scripts/requirements.txt', import.meta.url);
  await execFileAsync('python3', ['-m', 'pip', 'install', '-r', fileURLToPath(requirementsPath)], {
    maxBuffer: 20 * 1024 * 1024,
    timeout: PYTHON_PIP_TIMEOUT_MS,
  });
  parserDependenciesInstalled = true;
}

async function parseWithPythonOnce(filename: string, input: Buffer): Promise<{
  parsed: DownloadedAttachment['parsed'];
  content: string;
  truncated: boolean;
  error?: string;
} | null> {
  const tempDir = await mkdtemp(join(tmpdir(), 'jira-mcp-server-'));
  // Use basename to prevent path traversal from Jira-supplied filenames
  const tempPath = join(tempDir, basename(filename));

  try {
    await writeFile(tempPath, input);
    const scriptPath = new URL('../scripts/parse_attachment.py', import.meta.url);
    const { stdout } = await execFileAsync('python3', [fileURLToPath(scriptPath), tempPath], {
      maxBuffer: 2 * 1024 * 1024,
      timeout: PYTHON_PARSE_TIMEOUT_MS,
    });
    const parsed = JSON.parse(stdout) as {
      ok: boolean; format?: string; summary?: string; content?: string; truncated?: boolean; error?: string;
    };
    if (!parsed.ok) {
      return { parsed: { format: 'unknown', parser: 'python', summary: '' }, content: '', truncated: false, error: parsed.error || 'unknown parser error' };
    }
    if (!parsed.format || !parsed.summary || typeof parsed.content !== 'string') { return null; }
    return {
      parsed: { format: parsed.format, parser: 'python', summary: parsed.summary },
      content: parsed.content,
      truncated: Boolean(parsed.truncated),
    };
  } catch {
    return null;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export async function parseAttachmentWithPython(filename: string, input: Buffer): Promise<{
  parsed: DownloadedAttachment['parsed'];
  content: string;
  truncated: boolean;
} | null> {
  const first = await parseWithPythonOnce(filename, input);
  if (!first) { return null; }
  if (!first.error) { return first; }
  if (!/required to parse/i.test(first.error)) { return null; }

  try {
    await installParserDependencies();
  } catch {
    return null;
  }

  const second = await parseWithPythonOnce(filename, input);
  if (!second || second.error) { return null; }
  return second;
}
