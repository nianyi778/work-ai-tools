#!/usr/bin/env node

import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { realpathSync } from 'node:fs';
import { registerDefaultClients } from './client-setup.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function getVersion(): Promise<string> {
  const pkgPath = resolve(__dirname, '../package.json');
  const pkg = JSON.parse(await readFile(pkgPath, 'utf8')) as { version: string };
  return pkg.version;
}

// Node version check — parseArgs requires >= 18.3
const [nodeMajor, nodeMinor] = process.versions.node.split('.').map(Number);
if (nodeMajor < 18 || (nodeMajor === 18 && (nodeMinor ?? 0) < 3)) {
  process.stderr.write(`jira-dev requires Node.js >= 18.3.0 (current: ${process.versions.node})\n`);
  process.exit(1);
}

const HELP = `
Usage: jira-dev <command> [options]

Commands:
  server              Start the MCP server (stdio transport)
  login               Authenticate via OAuth 2.0 browser flow
  status              Show current authentication and config status
  doctor              Run health checks (Node version, Python, config)
  upgrade             Upgrade jira-dev-mcp to the latest version
  setup               Register this MCP server with Claude Code / OpenCode
  config set-path     Map a Jira project key to a local repo path
  config set-comment-mode  Set comment confirmation mode (manual|auto)
  read <KEY>          Read a Jira issue and print details
  comment <KEY> <TEXT> Post a comment on a Jira issue (bypasses manual mode)
  download <KEY> [FILE] Download attachment(s) from a Jira issue

Options:
  -v, --version       Show version number
  -h, --help          Show this help message

Examples:
  jira-dev server
  jira-dev login
  jira-dev read AT-1338
  jira-dev comment AT-1338 "Analysis complete"
  jira-dev download AT-1338
  jira-dev download AT-1338 image1.png
  jira-dev config set-path AT /path/to/your/repo
`;

const COMMAND_HELP: Record<string, string> = {
  server: `
Usage: jira-dev server

Start the MCP server using stdio transport.
Add to your MCP client config:

  { "mcpServers": { "jira": { "command": "jira-dev", "args": ["server"] } } }
`,
  login: `
Usage: jira-dev login

Open a browser for Jira OAuth 2.0 authorization.
Requires:
  JIRA_CLIENT_ID=<id>
  JIRA_CLIENT_SECRET=<secret>
`,
  status: `
Usage: jira-dev status

Show current authentication mode, config file location, and mapped projects.
`,
  config: `
Usage: jira-dev config <subcommand>

Subcommands:
  set-path <PROJECT_KEY> <LOCAL_PATH>   Map a Jira project to a local directory
  set-comment-mode <manual|auto>        Set comment confirmation behavior
`,
  read: `
Usage: jira-dev read <ISSUE_KEY>

Read a Jira issue and print its details (markdown format).
Example: jira-dev read AT-1338
`,
  comment: `
Usage: jira-dev comment <ISSUE_KEY> <TEXT>

Post a comment on a Jira issue. Always posts directly (bypasses manual mode).
Example: jira-dev comment AT-1338 "Fix deployed to staging"
`,
  download: `
Usage: jira-dev download <ISSUE_KEY> [FILENAME]

Download attachment(s) from a Jira issue.
  Without filename: downloads all attachments and prints summary.
  With filename: downloads a single file.
Example:
  jira-dev download AT-1338
  jira-dev download AT-1338 image1.png
`,
};

export async function cmdSetup(): Promise<void> {
  const entry = { command: 'jira-dev', args: ['server'] };
  const result = await registerDefaultClients('jira', entry);

  for (const client of result.registered) {
    console.log(`✓ Registered in ${client}`);
  }
  for (const client of result.alreadyRegistered) {
    console.log(`✓ Already registered in ${client}`);
  }
  if (result.errors.length > 0) {
    for (const error of result.errors) {
      console.error(`✗ ${error}`);
    }
    process.exit(1);
  }

  console.log('\nRestart your MCP client to load the server.');
}

export async function cmdUpgrade(): Promise<void> {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const exec = promisify(execFile);

  // Check latest version on npm
  console.log('Checking latest version...');
  let latest: string;
  try {
    const { stdout } = await exec('npm', ['view', 'jira-dev-mcp', 'version', '--registry', 'https://registry.npmjs.org']);
    latest = stdout.trim();
  } catch {
    console.error('Failed to fetch latest version from npm. Check your network.');
    process.exit(1);
  }

  const current = await getVersion();
  if (current === latest) {
    console.log(`Already up to date. (${current})`);
    return;
  }

  console.log(`Upgrading ${current} → ${latest} ...`);
  try {
    const { spawn } = await import('node:child_process');
    await new Promise<void>((resolve, reject) => {
      const child = spawn('npm', ['install', '-g', `jira-dev-mcp@${latest}`], {
        stdio: 'inherit',
        shell: process.platform === 'win32',
      });
      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`npm install exited with code ${code}`));
      });
    });
    console.log(`\nUpgraded to jira-dev-mcp@${latest}`);
    console.log('Run: jira-dev --version  to confirm');
  } catch (err) {
    console.error(`Upgrade failed: ${err instanceof Error ? err.message : String(err)}`);
    console.error(`Try manually: npm install -g jira-dev-mcp@latest`);
    process.exit(1);
  }
}

export async function cmdDoctor(): Promise<void> {
  let allOk = true;
  const ok = (msg: string) => console.log(`  ✓ ${msg}`);
  const fail = (msg: string) => { console.log(`  ✗ ${msg}`); allOk = false; };
  const warn = (msg: string) => console.log(`  ! ${msg}`);

  // Node version
  console.log('\nNode.js');
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major > 18 || (major === 18 && (minor ?? 0) >= 3)) {
    ok(`v${process.versions.node} (>= 18.3.0 required)`);
  } else {
    fail(`v${process.versions.node} — upgrade to >= 18.3.0`);
  }

  // Python
  console.log('\nPython (for attachment parsing)');
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const exec = promisify(execFile);
  try {
    const { stdout } = await exec('python3', ['--version']);
    ok(stdout.trim());
  } catch {
    fail('python3 not found — CSV/XLSX/PDF parsing will not work');
  }

  // Config file
  console.log('\nConfig');
  const { loadUserConfig, CONFIG_PATH, configFileExists } = await import('./config.js');
  const exists = await configFileExists();
  if (!exists) {
    warn(`${CONFIG_PATH} does not exist — run: jira-dev login`);
  } else {
    ok(`${CONFIG_PATH} exists`);
    const config = await loadUserConfig();

    if (config.jira?.authMode === 'oauth' && config.jira.oauth) {
      const { oauth } = config.jira;
      const expiresIn = Math.round((oauth.expiresAt - Date.now()) / 1000 / 60);
      if (expiresIn > 5) {
        ok(`OAuth token valid (expires in ${expiresIn} minutes)`);
      } else if (expiresIn > 0) {
        warn(`OAuth token expires in ${expiresIn} minutes — will auto-refresh`);
      } else {
        fail(`OAuth token expired ${Math.abs(expiresIn)} minutes ago — run: jira-dev login`);
      }
      ok(`Jira site: ${oauth.cloudUrl}`);
    } else if (config.jira?.baseUrl) {
      ok(`baseUrl: ${config.jira.baseUrl}`);
      if (!config.jira.email) warn('email not set (required for basic auth)');
      else ok(`email: ${config.jira.email}`);
    } else {
      fail('Jira credentials not configured — run: jira-dev login');
    }

    const projectCount = Object.keys(config.projects ?? {}).length;
    if (projectCount === 0) {
      warn('No project paths mapped — run: jira-dev config set-path <KEY> <PATH>');
    } else {
      ok(`${projectCount} project path(s) mapped`);
    }
  }

  console.log('');
  if (allOk) {
    console.log('All checks passed.');
  } else {
    console.log('Some checks failed. See above for details.');
    process.exit(1);
  }
}

export async function cmdStatus(): Promise<void> {
  const { loadUserConfig, CONFIG_PATH } = await import('./config.js');
  const config = await loadUserConfig();

  console.log(`Config: ${CONFIG_PATH}`);
  console.log('');

  if (config.jira?.authMode === 'oauth' && config.jira.oauth) {
    const { oauth } = config.jira;
    const expiresIn = Math.round((oauth.expiresAt - Date.now()) / 1000 / 60);
    console.log(`Auth:   OAuth 2.0`);
    console.log(`Site:   ${oauth.cloudUrl}`);
    console.log(`Token:  ${expiresIn > 0 ? `expires in ${expiresIn} minutes` : 'EXPIRED — run: jira-dev login'}`);
  } else if (config.jira?.baseUrl) {
    console.log(`Auth:   ${config.jira.authMode ?? 'basic'}`);
    console.log(`URL:    ${config.jira.baseUrl}`);
    console.log(`Email:  ${config.jira.email ?? '(not set)'}`);
    console.log(`Token:  ${config.jira.token || config.jira.apiToken ? 'set' : '(not set)'}`);
  } else {
    console.log('Auth:   not configured');
    console.log('Run: jira-dev login  (OAuth)');
    console.log(' or: set JIRA_BASE_URL, JIRA_EMAIL, JIRA_TOKEN  (Basic)');
  }

  const projects = config.projects ?? {};
  const projectKeys = Object.keys(projects);
  console.log('');
  if (projectKeys.length === 0) {
    console.log('Projects: none mapped');
    console.log('Run: jira-dev config set-path <PROJECT_KEY> <LOCAL_PATH>');
  } else {
    console.log('Projects:');
    for (const [key, path] of Object.entries(projects)) {
      console.log(`  ${key} → ${path}`);
    }
  }
}

export async function cmdConfigSetPath(args: string[]): Promise<void> {
  const [projectKey, localPath] = args;
  if (!projectKey || !localPath) {
    console.error('Usage: jira-dev config set-path <PROJECT_KEY> <LOCAL_PATH>');
    process.exit(1);
  }
  const { setProjectPath, CONFIG_PATH } = await import('./config.js');
  const result = await setProjectPath(projectKey, resolve(localPath));
  console.log(`Mapped ${result.projectKey} → ${result.localPath}`);
  console.log(`Saved to ${CONFIG_PATH}`);
}

export async function cmdConfigSetCommentMode(args: string[]): Promise<void> {
  const [mode] = args;
  if (mode !== 'manual' && mode !== 'auto') {
    console.error('Usage: jira-dev config set-comment-mode <manual|auto>');
    process.exit(1);
  }
  const { setCommentMode, CONFIG_PATH } = await import('./config.js');
  const result = await setCommentMode(mode);
  console.log(`Comment mode set to ${result.commentMode}`);
  console.log(`Saved to ${CONFIG_PATH}`);
}

export async function cmdRead(args: string[]): Promise<void> {
  const [issueKey] = args;
  if (!issueKey) {
    console.error('Usage: jira-dev read <ISSUE_KEY>');
    process.exit(1);
  }
  const { handleReadTask } = await import('./tools/read-task.js');
  const result = await handleReadTask({ input: issueKey.trim().toUpperCase(), response_format: 'markdown' });
  console.log(result.text);
}

export async function cmdComment(args: string[]): Promise<void> {
  const [issueKey, ...bodyParts] = args;
  const body = bodyParts.join(' ');
  if (!issueKey || !body) {
    console.error('Usage: jira-dev comment <ISSUE_KEY> <TEXT>');
    process.exit(1);
  }
  const { ensureJiraCredentials, loadResolvedConfig } = await import('./config.js');
  const { addComment } = await import('./jira-client.js');
  const config = await loadResolvedConfig();
  ensureJiraCredentials(config);
  const autoConfig = { ...config, preferences: { ...config.preferences, commentMode: 'auto' as const } };
  const result = await addComment(autoConfig, { key: issueKey.trim().toUpperCase(), body });
  if (result.posted) {
    console.log(`Comment posted: ${result.url}`);
  } else {
    console.error('Failed to post comment.');
    process.exit(1);
  }
}

export async function cmdDownload(args: string[]): Promise<void> {
  const [issueKey, filename] = args;
  if (!issueKey) {
    console.error('Usage: jira-dev download <ISSUE_KEY> [FILENAME]');
    process.exit(1);
  }
  const key = issueKey.trim().toUpperCase();

  if (filename) {
    const { handleDownloadAttachment } = await import('./tools/attachment.js');
    const result = await handleDownloadAttachment({ key, filename: filename.trim(), response_format: 'markdown' });
    console.log(result.text);
  } else {
    const { handleDownloadAllAttachments } = await import('./tools/attachment.js');
    const result = await handleDownloadAllAttachments({ key, response_format: 'markdown' });
    console.log(result.text);
  }
}

export async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      version: { type: 'boolean', short: 'v' },
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: true,
    strict: false,
  });

  if (values.version) {
    console.log(`jira-dev v${await getVersion()}`);
    return;
  }

  const [command, ...rest] = positionals;

  if (values.help || !command) {
    if (command && COMMAND_HELP[command]) {
      console.log(COMMAND_HELP[command]);
    } else {
      console.log(HELP);
    }
    return;
  }

  switch (command) {
    case 'server': {
      const { main: startServer } = await import('./index.js');
      await startServer();
      break;
    }
    case 'login': {
      await import('./login.js');
      break;
    }
    case 'status': {
      await cmdStatus();
      break;
    }
    case 'doctor': {
      await cmdDoctor();
      break;
    }
    case 'upgrade': {
      await cmdUpgrade();
      break;
    }
    case 'setup': {
      await cmdSetup();
      break;
    }
    case 'config': {
      const [sub, ...subArgs] = rest;
      if (sub === 'set-path') {
        await cmdConfigSetPath(subArgs);
      } else if (sub === 'set-comment-mode') {
        await cmdConfigSetCommentMode(subArgs);
      } else {
        console.log(COMMAND_HELP['config']);
      }
      break;
    }
    case 'read': {
      await cmdRead(rest);
      break;
    }
    case 'comment': {
      await cmdComment(rest);
      break;
    }
    case 'download': {
      await cmdDownload(rest);
      break;
    }
    default: {
      console.error(`Unknown command: ${command}`);
      console.error('Run: jira-dev --help');
      process.exit(1);
    }
  }
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === fileURLToPath(import.meta.url)) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
