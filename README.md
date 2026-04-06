# work-ai-tools

Work-related Claude Code skills and MCP servers.

## Skills

Claude Code skills loaded via `~/.claude/skills/`. Invoke with the `Skill` tool.

| Skill | Description |
|-------|-------------|
| [jira-defect-analysis](./skills/jira-defect-analysis/) | Analyze software defects by cross-referencing Jira issues with source code, classify root causes, and backfill results into a Google Sheet |

## MCPs

Model Context Protocol servers.

| MCP | Description |
|-----|-------------|
| [jira-dev-mcp](./mcps/jira-dev-mcp/) | Local MCP server for Jira Cloud-driven development — search issues, read tasks, parse attachments, OAuth 2.0 login |

## Setup

```bash
git clone git@github.com:nianyi778/work-ai-tools.git ~/personage/work-ai-tools

# Link skills
ln -s ~/personage/work-ai-tools/skills/jira-defect-analysis ~/.claude/skills/jira-defect-analysis-real

# MCP setup — see mcps/jira-dev-mcp/README.md
```
