import { access, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { OAuthTokens, ResolvedConfig, UserConfig } from './types.js';
import { BUILTIN_CLIENT_SECRET } from './defaults.js';
import { JiraAuthError } from './errors.js';

const execFileAsync = promisify(execFile);

export const CONFIG_DIR = resolve(homedir(), '.jira-dev');
export const CONFIG_PATH = resolve(CONFIG_DIR, 'config.json');
export const KEYCHAIN_SERVICE = 'jira-dev-mcp:JIRA_TOKEN';

const DEFAULT_MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;
const DEFAULT_COMMENT_MODE = 'manual';

// TTL cache for resolved config (avoids repeated disk reads + keychain subprocess per tool call)
const CONFIG_CACHE_TTL_MS = 60_000;
let _cachedConfig: { value: ResolvedConfig; expiresAt: number } | null = null;
let _loadConfigPromise: Promise<ResolvedConfig> | null = null;
export function clearConfigCache(): void {
  _cachedConfig = null;
  _loadConfigPromise = null;
}

// Singleton refresh promise — prevents concurrent token refresh racing (invalid_grant)
let _refreshPromise: Promise<OAuthTokens> | null = null;

const DEFAULT_ALLOWED_MIME_TYPES = [
  'text/*',
  'application/json',
  'application/pdf',
  'image/*',
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.oasis.opendocument.spreadsheet',
];

export async function loadUserConfig(): Promise<UserConfig> {
  try {
    const content = await readFile(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(content) as UserConfig;
    return parsed;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return {};
    }
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read config file ${CONFIG_PATH}: ${detail}`);
  }
}

async function readKeychainToken(): Promise<string | undefined> {
  if (process.platform !== 'darwin') {
    return undefined;
  }

  try {
    const { stdout } = await execFileAsync('security', [
      'find-generic-password',
      '-s',
      KEYCHAIN_SERVICE,
      '-w',
    ]);
    const token = stdout.trim();
    return token || undefined;
  } catch {
    return undefined;
  }
}

async function refreshOAuthTokenOnce(oauth: OAuthTokens): Promise<OAuthTokens> {
  if (!_refreshPromise) {
    _refreshPromise = refreshOAuthToken(oauth).finally(() => { _refreshPromise = null; });
  }
  return _refreshPromise;
}

async function refreshOAuthToken(oauth: OAuthTokens): Promise<OAuthTokens> {
  const response = await fetch('https://auth.atlassian.com/oauth/token', {
    method: 'POST',
    signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: oauth.clientId,
      // Prefer env var override, then built-in secret; never rely on persisted clientSecret in config.json
      client_secret: process.env.JIRA_CLIENT_SECRET || BUILTIN_CLIENT_SECRET,
      refresh_token: oauth.refreshToken,
    }),
  });

  if (!response.ok) {
    throw new Error(`Token refresh failed: ${response.status}`);
  }

  const data = await response.json() as { access_token: string; refresh_token?: string; expires_in: number };
  return {
    ...oauth,
    accessToken: data.access_token,
    refreshToken: data.refresh_token || oauth.refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

export async function loadResolvedConfig(): Promise<ResolvedConfig> {
  const now = Date.now();
  if (_cachedConfig && _cachedConfig.expiresAt > now) {
    return _cachedConfig.value;
  }

  if (!_loadConfigPromise) {
    _loadConfigPromise = _loadResolvedConfig()
      .then((result) => {
        _cachedConfig = { value: result, expiresAt: Date.now() + CONFIG_CACHE_TTL_MS };
        return result;
      })
      .finally(() => { _loadConfigPromise = null; });
  }
  return _loadConfigPromise;
}

async function _loadResolvedConfig(): Promise<ResolvedConfig> {
  const fileConfig = await loadUserConfig();
  const warnings: string[] = [];

  // OAuth mode: auto-refresh token if expiring within 5 minutes
  if (fileConfig.jira?.authMode === 'oauth' && fileConfig.jira.oauth) {
    let oauth = fileConfig.jira.oauth;
    if (oauth.expiresAt < Date.now() + 5 * 60 * 1000) {
      try {
        oauth = await refreshOAuthTokenOnce(oauth);
        fileConfig.jira = { ...fileConfig.jira, oauth };
        await saveUserConfig(fileConfig);
        clearConfigCache(); // invalidate cache after token refresh
      } catch (err) {
        warnings.push(
          `OAuth token refresh failed: ${err instanceof Error ? err.message : 'unknown'}. Run jira-mcp-login to re-authenticate.`
        );
      }
    }

    return {
      jira: {
        baseUrl: `https://api.atlassian.com/ex/jira/${oauth.cloudId}`,
        browseUrl: oauth.cloudUrl,
        authMode: 'bearer',
        token: oauth.accessToken,
      },
      projects: fileConfig.projects || {},
      preferences: {
        commentMode: fileConfig.preferences?.commentMode || DEFAULT_COMMENT_MODE,
      },
      security: {
        maxAttachmentSizeBytes: fileConfig.security?.maxAttachmentSizeBytes || DEFAULT_MAX_ATTACHMENT_SIZE,
        allowedMimeTypes: fileConfig.security?.allowedMimeTypes || DEFAULT_ALLOWED_MIME_TYPES,
      },
      warnings,
    };
  }

  const keychainToken = await readKeychainToken();
  const token = process.env.JIRA_TOKEN || process.env.JIRA_API_TOKEN || keychainToken || fileConfig.jira?.token || fileConfig.jira?.apiToken;
  const authMode = process.env.JIRA_AUTH_MODE === 'bearer' || fileConfig.jira?.authMode === 'bearer' ? 'bearer' : 'basic';

  if (fileConfig.jira?.token || fileConfig.jira?.apiToken) {
    warnings.push('Plaintext Jira token found in config.json. Prefer env vars or macOS Keychain.');
  }

  if (authMode === 'basic' && !process.env.JIRA_EMAIL && !fileConfig.jira?.email) {
    warnings.push('Basic auth mode requires jira.email or JIRA_EMAIL.');
  }

  return {
    jira: {
      baseUrl: process.env.JIRA_BASE_URL || fileConfig.jira?.baseUrl,
      authMode,
      email: process.env.JIRA_EMAIL || fileConfig.jira?.email,
      token,
    },
    projects: fileConfig.projects || {},
    preferences: {
      commentMode: fileConfig.preferences?.commentMode || DEFAULT_COMMENT_MODE,
    },
    security: {
      maxAttachmentSizeBytes:
        fileConfig.security?.maxAttachmentSizeBytes || DEFAULT_MAX_ATTACHMENT_SIZE,
      allowedMimeTypes: fileConfig.security?.allowedMimeTypes || DEFAULT_ALLOWED_MIME_TYPES,
    },
    warnings,
  };
}

export async function ensureConfigDirectory(): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
}

export async function saveUserConfig(config: UserConfig): Promise<void> {
  await ensureConfigDirectory();
  await writeFile(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
}

export async function setProjectPath(projectKey: string, localPath: string): Promise<{ projectKey: string; localPath: string }> {
  const normalizedProjectKey = projectKey.trim().toUpperCase();
  const normalizedPath = resolve(localPath);
  const pathStats = await stat(normalizedPath).catch(() => null);
  if (!pathStats || !pathStats.isDirectory()) {
    throw new Error(`Project path does not exist or is not a directory: ${normalizedPath}`);
  }

  const config = await loadUserConfig();
  config.projects = {
    ...(config.projects || {}),
    [normalizedProjectKey]: normalizedPath,
  };
  await saveUserConfig(config);
  clearConfigCache();

  return { projectKey: normalizedProjectKey, localPath: normalizedPath };
}

export async function getProjectPath(projectKey: string): Promise<string | null> {
  const normalizedKey = projectKey.trim().toUpperCase();
  // Prefer in-memory cache (ResolvedConfig) to avoid an extra disk read per tool call.
  // Falls back to direct file read only when the cache is cold (e.g. first call after startup).
  const now = Date.now();
  if (_cachedConfig && _cachedConfig.expiresAt > now) {
    return _cachedConfig.value.projects[normalizedKey] ?? null;
  }
  const config = await loadUserConfig();
  return config.projects?.[normalizedKey] ?? null;
}

export async function setCommentMode(mode: 'manual' | 'auto'): Promise<{ commentMode: 'manual' | 'auto' }> {
  const config = await loadUserConfig();
  config.preferences = {
    ...(config.preferences || {}),
    commentMode: mode,
  };
  await saveUserConfig(config);
  clearConfigCache();
  return { commentMode: mode };
}

export async function getCommentMode(): Promise<'manual' | 'auto'> {
  const config = await loadUserConfig();
  return config.preferences?.commentMode || DEFAULT_COMMENT_MODE;
}

export async function configFileExists(): Promise<boolean> {
  try {
    await access(CONFIG_PATH);
    return true;
  } catch {
    return false;
  }
}

export function ensureJiraCredentials(config: ResolvedConfig): void {
  if (!config.jira.baseUrl || !config.jira.token) {
    throw new JiraAuthError(
      `Missing Jira credentials. Configure JIRA_BASE_URL and JIRA_TOKEN or update ${CONFIG_PATH}`
    );
  }

  if (config.jira.authMode === 'basic' && !config.jira.email) {
    throw new JiraAuthError(`Missing Jira email for basic auth. Configure JIRA_EMAIL or update ${CONFIG_PATH}`);
  }
}

export async function ensureConfigPermissions(): Promise<void> {
  if (!(await configFileExists())) {
    return;
  }

  if (process.platform !== 'win32') {
    await access(dirname(CONFIG_PATH));
  }
}

/** Extract the project key from an issue key (e.g. "AT-123" → "AT"). */
export function inferProjectKey(issueKey: string): string {
  const match = issueKey.match(/^([A-Z][A-Z0-9]+)-\d+$/);
  return match ? match[1] : issueKey;
}
