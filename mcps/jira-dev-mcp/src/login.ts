#!/usr/bin/env node

import { createServer, type Server } from 'node:http';
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { CONFIG_PATH, loadUserConfig, saveUserConfig } from './config.js';
import { BUILTIN_CLIENT_ID, BUILTIN_CLIENT_SECRET } from './defaults.js';
import type { OAuthTokens } from './types.js';

const SCOPES = ['read:jira-work', 'write:jira-work', 'read:jira-user', 'offline_access'];
const PREFERRED_PORTS = [3737, 3738, 3739, 3740, 0] as const;
const AUTH_TIMEOUT_MS = 5 * 60 * 1000;

const SUCCESS_HTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Jira Login</title><style>
body{font-family:system-ui;max-width:480px;margin:80px auto;text-align:center;color:#1f2937}
h1{font-size:2rem;color:#16a34a}p{color:#6b7280}
</style></head>
<body><h1>&#x2713; Authorization successful</h1><p>You can close this window and return to the terminal.</p></body>
</html>`;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

const ERROR_HTML = (msg: string) => `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Jira Login</title></head>
<body><h1>Authorization failed</h1><p>${escapeHtml(msg)}</p><p>You can close this window.</p></body>
</html>`;

function openBrowser(url: string): void {
  if (process.platform === 'darwin') {
    execFile('open', [url]);
  } else if (process.platform === 'win32') {
    execFile('cmd', ['/c', 'start', '', url]);
  } else {
    execFile('xdg-open', [url]);
  }
}

async function startCallbackServer(): Promise<{ server: Server; port: number }> {
  for (const port of PREFERRED_PORTS) {
    const server = createServer(() => {});
    const boundPort = await new Promise<number>((resolve, reject) => {
      server.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') resolve(-1);
        else reject(err);
      });
      server.listen(port, '127.0.0.1', () => {
        const addr = server.address();
        resolve(typeof addr === 'object' && addr ? addr.port : port);
      });
    });
    if (boundPort >= 0) return { server, port: boundPort };
    server.close();
  }
  throw new Error('Could not bind any port for OAuth callback (tried 3737-3740 and OS-assigned).');
}

function waitForAuthCode(server: Server, port: number, expectedState: string): Promise<string> {
  return new Promise((resolve, reject) => {
    server.removeAllListeners('request');
    server.on('request', (req, res) => {
      const url = new URL(req.url!, `http://localhost:${port}`);
      if (url.pathname !== '/callback') {
        res.writeHead(404).end();
        return;
      }

      const error = url.searchParams.get('error');
      if (error) {
        res.writeHead(400, { 'Content-Type': 'text/html' }).end(ERROR_HTML(error));
        server.close();
        reject(new Error(`OAuth denied: ${error}`));
        return;
      }

      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      if (!code || state !== expectedState) {
        res.writeHead(400, { 'Content-Type': 'text/html' }).end(ERROR_HTML('Invalid callback parameters'));
        server.close();
        reject(new Error('Invalid state or missing code'));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(SUCCESS_HTML);
      clearTimeout(timeoutId);
      server.close();
      resolve(code);
    });

    const timeoutId = setTimeout(() => {
      server.close();
      reject(new Error('Authorization timed out (5 minutes). Please try again.'));
    }, AUTH_TIMEOUT_MS);
  });
}

async function exchangeCode(clientId: string, clientSecret: string, code: string, redirectUri: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const response = await fetch('https://auth.atlassian.com/oauth/token', {
    method: 'POST',
    signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Token exchange failed (${response.status}): ${body.slice(0, 200)}`);
  }

  return response.json() as Promise<{ access_token: string; refresh_token: string; expires_in: number }>;
}

async function getAccessibleResources(accessToken: string): Promise<Array<{ id: string; name: string; url: string }>> {
  const response = await fetch('https://api.atlassian.com/oauth/token/accessible-resources', {
    signal: AbortSignal.timeout(10000),
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch accessible sites (${response.status})`);
  }

  return response.json() as Promise<Array<{ id: string; name: string; url: string }>>;
}

async function pickSite(resources: Array<{ id: string; name: string; url: string }>): Promise<{ id: string; name: string; url: string }> {
  if (resources.length === 1) {
    return resources[0];
  }

  console.log('\nMultiple Jira sites found:');
  for (let i = 0; i < resources.length; i++) {
    console.log(`  [${i + 1}] ${resources[i].name}  (${resources[i].url})`);
  }
  process.stdout.write('\nEnter number [1]: ');

  return new Promise((resolve, reject) => {
    process.stdin.setEncoding('utf8');
    process.stdin.resume();
    process.stdin.once('data', (chunk) => {
      process.stdin.pause();
      const input = String(chunk).trim();
      const index = input === '' ? 0 : parseInt(input, 10) - 1;
      if (isNaN(index) || index < 0 || index >= resources.length) {
        reject(new Error(`Invalid selection: ${input}`));
      } else {
        resolve(resources[index]);
      }
    });
  });
}

async function main() {
  const clientId = process.env.JIRA_CLIENT_ID || BUILTIN_CLIENT_ID;
  const clientSecret = process.env.JIRA_CLIENT_SECRET || BUILTIN_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('Error: OAuth credentials not configured.\n');
    console.error('Set environment variables before running login:\n');
    console.error('  export JIRA_CLIENT_ID=<your-oauth-client-id>');
    console.error('  export JIRA_CLIENT_SECRET=<your-oauth-client-secret>\n');
    console.error('To create an OAuth app:');
    console.error('  1. Go to https://developer.atlassian.com/console/myapps/');
    console.error('  2. Create → OAuth 2.0 integration');
    console.error('  3. Add callback URL: http://localhost:3737/callback');
    console.error(`  4. Add scopes: ${SCOPES.join('  ')}`);
    process.exit(1);
  }

  const { server, port } = await startCallbackServer();
  const redirectUri = `http://localhost:${port}/callback`;
  const state = randomBytes(16).toString('hex');

  const authUrl = new URL('https://auth.atlassian.com/authorize');
  authUrl.searchParams.set('audience', 'api.atlassian.com');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('scope', SCOPES.join(' '));
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('prompt', 'consent');

  console.log('Opening browser for Jira authorization...');
  console.log(`\nIf the browser does not open, visit:\n  ${authUrl.toString()}\n`);
  openBrowser(authUrl.toString());

  const code = await waitForAuthCode(server, port, state);
  console.log('Authorization code received. Exchanging for tokens...');

  const tokens = await exchangeCode(clientId, clientSecret, code, redirectUri);
  console.log('Fetching accessible Jira sites...');

  const resources = await getAccessibleResources(tokens.access_token);
  if (resources.length === 0) {
    console.error('No accessible Jira sites found. Check that your OAuth app has the correct scopes and you have access to a Jira Cloud site.');
    process.exit(1);
  }

  const site = await pickSite(resources);

  const oauth: OAuthTokens = {
    clientId,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + tokens.expires_in * 1000,
    cloudId: site.id,
    cloudUrl: site.url,
  };

  const config = await loadUserConfig();
  config.jira = {
    ...config.jira,
    authMode: 'oauth',
    oauth,
    token: undefined,
    apiToken: undefined,
    email: undefined,
    baseUrl: undefined,
  };
  await saveUserConfig(config);

  console.log(`\n✓ Logged in to ${site.name}`);
  console.log(`  Site:   ${site.url}`);
  console.log(`  Config: ${CONFIG_PATH}`);
  console.log('\nThe MCP server will automatically refresh the token when it expires.');
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error('\nLogin failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
