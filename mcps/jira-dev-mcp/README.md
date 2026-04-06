# jira-dev-mcp

A local MCP server for Jira Cloud-driven development. Connects Claude Code, OpenCode, Codex, and other MCP clients to your Jira instance — search issues, read task details, parse attachments, and map Jira projects to local repositories.

[![npm version](https://img.shields.io/npm/v/jira-dev-mcp.svg)](https://www.npmjs.com/package/jira-dev-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Other languages:** [中文](README.zh.md) · [日本語](README.ja.md)

## Features

- Search Jira issues with natural language or raw JQL
- Read full task details: description, subtasks, changelog, comments, attachments
- Download and parse CSV, XLSX, XLS, PDF attachments via Python
- Images and binary files passed to AI client as base64
- Map Jira project keys to local repository paths
- OAuth 2.0 (3LO) browser-based login — no manual token management
- Auto-refresh OAuth tokens before expiry
- Post comments on Jira issues with clickable URL response
- Token-only comment confirmation: confirm pending comments with just the token, no need to re-send body
- Edit existing comments with the same confirmation flow
- Batch download all attachments from an issue in a single call with optional MIME filter
- Auto-retry on transient API errors (429/503) with Retry-After header support
- Rich ADF parsing: code blocks, tables, mentions, links, panels, and more
- Multi-paragraph and fenced code block support in posted comments
- Typed error hierarchy for programmatic error handling
- OAuth callback port auto-fallback when default port is busy
- Read and write Jira access

## Install

```bash
npm install -g jira-dev-mcp
```

## Authentication

### Option A: OAuth 2.0 (Recommended)

Just run:

```bash
jira-dev login
```

A browser window opens for Jira authorization. Tokens are saved to `~/.jira-dev/config.json` and auto-refreshed. No manual Client ID or Secret required.

> **Advanced**: To use your own OAuth app, set `JIRA_CLIENT_ID` and `JIRA_CLIENT_SECRET` before running `jira-dev login`.

### Option B: API Token (Basic Auth)

```bash
export JIRA_BASE_URL="https://your-domain.atlassian.net"
export JIRA_EMAIL="you@example.com"
export JIRA_TOKEN="your-jira-api-token"
```

Optional — store token in macOS Keychain instead of env var:

```bash
security add-generic-password -a "$USER" -s "jira-dev-mcp:JIRA_TOKEN" -w "your-token"
```

## MCP Client Configuration

### Auto-register (easiest)

```bash
jira-dev setup
```

This creates or updates `~/.claude.json` (Claude Code) and `~/.opencode/config.json` (OpenCode) automatically.
If an existing config file contains invalid JSON, `jira-dev setup` now fails with an explicit error instead of silently skipping it.

### Manual — Claude Code (`~/.claude.json`)

```json
{
  "mcpServers": {
    "jira": {
      "command": "jira-dev",
      "args": ["server"]
    }
  }
}
```

### Manual — OpenCode / Codex

```json
{
  "mcpServers": {
    "jira": {
      "command": "jira-dev",
      "args": ["server"]
    }
  }
}
```

### With environment variables

```json
{
  "mcpServers": {
    "jira": {
      "command": "jira-mcp-server",
      "env": {
        "JIRA_BASE_URL": "https://your-domain.atlassian.net",
        "JIRA_EMAIL": "you@example.com",
        "JIRA_TOKEN": "your-token"
      }
    }
  }
}
```

## Tools

| Tool | Description |
|------|-------------|
| `jira_search_issues` | Search by keywords or JQL |
| `jira_read_task` | Read full issue details |
| `jira_download_attachment` | Download and parse a single attachment |
| `jira_download_all_attachments` | Download all attachments in one call; optional MIME filter (e.g. `image/`) |
| `jira_my_tasks` | List issues assigned to you |
| `jira_add_comment` | Post a comment; confirm with token only (no body re-send needed) |
| `jira_edit_comment` | Edit an existing comment; same token-only confirm flow |
| `jira_set_project_path` | Map a Jira project to a local repo path |
| `jira_get_project_path` | Get the local path for a project |
| `jira_analyze_task` | Full investigation workflow: reads issue + comments + attachments, selects type-aware template (Bug/Story/Task), and guides step-by-step through explore → plan → implement → post comment |

## CLI Commands

```bash
jira-dev status    # Show current auth mode, token state, and mapped projects
jira-dev doctor    # Run environment and config health checks
jira-dev upgrade   # Upgrade jira-dev-mcp from npm
jira-dev setup     # Register jira-dev into supported MCP clients
jira-dev read AT-123             # Read issue details from the terminal
jira-dev comment AT-123 "Done"   # Post a comment directly (bypasses manual mode)
jira-dev download AT-123         # Download all attachments
jira-dev download AT-123 spec.xlsx  # Download a single attachment
jira-dev config set-comment-mode manual   # Require confirmation before posting comments
```

## Development Workflow

### Standard usage with Claude Code

**Step 1 — One-time setup: map your project**

```
jira_set_project_path(jiraProject: "AT", localPath: "/path/to/your/repo")
```

**Step 2 — Find your task**

```
jira_my_tasks(status: "In Progress")
```

or search by keyword / JQL:

```
jira_search_issues(query: "login timeout bug")
jira_search_issues(query: "project = AT AND sprint in openSprints()")
```

**Step 3 — Read the task**

```
jira_read_task(key: "AT-123", includeComments: true)
```

Returns: description, subtasks, changelog, comments, attachment list, and the local repo path.

**Step 4 — Download attachments if needed**

```
jira_download_all_attachments(key: "AT-123")
jira_download_all_attachments(key: "AT-123", mime_filter: "image/")
jira_download_attachment(key: "AT-123", filename: "spec.xlsx")
```

Use `jira_download_all_attachments` to grab everything in one call, or filter by MIME type. Use `jira_download_attachment` for a single file. CSV / XLSX / XLS / PDF are parsed and returned as structured text. Images are returned as base64.

**Step 5 — AI implements the fix**

With the task details and local repo path in context, ask Claude Code to:

- Explain the root cause
- Propose a plan with impact scope
- Implement the fix
- Write test cases

## Project Path Mapping

Map a Jira project key to a local repo so the AI knows where to look:

```
jira_set_project_path(jiraProject: "AT", localPath: "/Users/you/projects/my-app")
```

## Python Dependency (Attachment Parsing)

Python 3 is required for CSV, XLSX, XLS, and PDF parsing. For XLS and PDF, additional packages are auto-installed on first use, or install manually:

```bash
python3 -m pip install -r $(npm root -g)/jira-dev-mcp/scripts/requirements.txt
```

## Security

- OAuth tokens stored at `~/.jira-dev/config.json` with `600` permissions
- API tokens: prefer env vars or macOS Keychain over config file
- Attachment size and MIME type allowlist enforced before download
- OAuth client credentials injected at build time — never committed to source
- Secrets are never written to logs

## Local Development

```bash
git clone https://github.com/nianyi778/jira-dev-mcp.git
cd jira-dev-mcp
npm install
npm run generate-defaults   # required before first build (uses env vars or empty placeholders)
npm test
npm run build
```

Inspect tools interactively:

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

## License

MIT
