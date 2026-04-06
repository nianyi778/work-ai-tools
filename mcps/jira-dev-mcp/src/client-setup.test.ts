import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { registerMcpServerConfig } from './client-setup.js';

const createdDirs: string[] = [];

afterEach(async () => {
  while (createdDirs.length > 0) {
    const dir = createdDirs.pop();
    if (dir) {
      await import('node:fs/promises').then(({ rm }) => rm(dir, { recursive: true, force: true }));
    }
  }
});

async function makeTempFilePath(relativePath: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'jira-dev-setup-test-'));
  createdDirs.push(dir);
  return join(dir, relativePath);
}

describe('registerMcpServerConfig', () => {
  const entry = { command: 'jira-dev', args: ['server'] };

  it('creates a config file when missing', async () => {
    const filePath = await makeTempFilePath('.claude.json');

    const result = await registerMcpServerConfig(filePath, 'jira', entry);
    const saved = JSON.parse(await readFile(filePath, 'utf8')) as { mcpServers: Record<string, unknown> };

    expect(result).toMatchObject({ created: true, updated: true, alreadyRegistered: false });
    expect(saved.mcpServers.jira).toEqual(entry);
  });

  it('adds mcpServers when config exists without that field', async () => {
    const filePath = await makeTempFilePath('config.json');
    await writeFile(filePath, `${JSON.stringify({ theme: 'light' }, null, 2)}\n`);

    const result = await registerMcpServerConfig(filePath, 'jira', entry);
    const saved = JSON.parse(await readFile(filePath, 'utf8')) as Record<string, unknown>;

    expect(result).toMatchObject({ created: false, updated: true, alreadyRegistered: false });
    expect(saved.theme).toBe('light');
    expect(saved.mcpServers).toEqual({ jira: entry });
  });

  it('throws a clear error for invalid json', async () => {
    const filePath = await makeTempFilePath('broken.json');
    await writeFile(filePath, '{broken');

    await expect(registerMcpServerConfig(filePath, 'jira', entry)).rejects.toThrow(
      `Config file is not valid JSON: ${filePath}`,
    );
  });
});
