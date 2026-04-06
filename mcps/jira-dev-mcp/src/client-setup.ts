import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { homedir } from 'node:os';

export interface McpServerEntry {
  command: string;
  args: string[];
}

interface ClientTarget {
  label: string;
  path: string;
}

const CLIENT_TARGETS: ClientTarget[] = [
  { label: 'Claude Code', path: resolve(homedir(), '.claude.json') },
  { label: 'OpenCode', path: resolve(homedir(), '.opencode', 'config.json') },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function registerMcpServerConfig(
  filePath: string,
  serverName: string,
  entry: McpServerEntry,
): Promise<{ created: boolean; updated: boolean; alreadyRegistered: boolean }> {
  let data: Record<string, unknown> = {};
  let created = false;

  try {
    const raw = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) {
      throw new Error('Config root must be a JSON object');
    }
    data = parsed;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      created = true;
    } else if (error instanceof SyntaxError) {
      throw new Error(`Config file is not valid JSON: ${filePath}`);
    } else if (error instanceof Error && error.message === 'Config root must be a JSON object') {
      throw new Error(`Config file must contain a JSON object: ${filePath}`);
    } else {
      throw error;
    }
  }

  const servers = isRecord(data.mcpServers) ? { ...data.mcpServers } : {};
  if (servers[serverName]) {
    return { created, updated: false, alreadyRegistered: true };
  }

  servers[serverName] = entry;
  const nextData = { ...data, mcpServers: servers };
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(nextData, null, 2)}\n`);
  return { created, updated: true, alreadyRegistered: false };
}

export async function registerDefaultClients(
  serverName: string,
  entry: McpServerEntry,
): Promise<{ registered: string[]; alreadyRegistered: string[]; errors: string[] }> {
  const registered: string[] = [];
  const alreadyRegistered: string[] = [];
  const errors: string[] = [];

  for (const target of CLIENT_TARGETS) {
    try {
      const result = await registerMcpServerConfig(target.path, serverName, entry);
      if (result.alreadyRegistered) {
        alreadyRegistered.push(target.label);
      } else {
        registered.push(target.label);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${target.label}: ${message}`);
    }
  }

  return { registered, alreadyRegistered, errors };
}
