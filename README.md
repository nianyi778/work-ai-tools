# work-ai-tools

Work-related Claude Code skills and MCP servers. Monorepo at `github.com/nianyi778/work-ai-tools`.

## Structure

```
work-ai-tools/
├── skills/
│   └── {skill-name}/
│       ├── package.json           # npm: @nianyi778/skill-{skill-name}, keyword: agent-skill
│       └── skills/
│           └── {skill-name}/
│               ├── SKILL.md       # frontmatter: name, description
│               └── reference/
└── mcps/
    └── {mcp-name}/
        ├── package.json           # npm: {mcp-name}
        └── src/
```

## Skills

| Skill | npm | Description |
|-------|-----|-------------|
| [jira-defect-analysis](./skills/jira-defect-analysis/) | `@nianyi778/skill-jira-defect-analysis` | Analyze Jira defects against source code, classify root causes, backfill Google Sheet |

## MCPs

| MCP | npm | Description |
|-----|-----|-------------|
| [jira-dev-mcp](./mcps/jira-dev-mcp/) | `jira-dev-mcp` | Jira Cloud MCP — search, read tasks, attachments, OAuth 2.0 |

---

## Adding a New Skill

```bash
# 1. scaffold
mkdir -p skills/{name}/skills/{name}/reference

# 2. create SKILL.md
cat > skills/{name}/skills/{name}/SKILL.md << 'EOF'
---
name: {name}
description: One line — what it does and when to trigger.
---
# content
EOF

# 3. create package.json
cat > skills/{name}/package.json << 'EOF'
{
  "name": "@nianyi778/skill-{name}",
  "version": "1.0.0",
  "keywords": ["agent-skill", "claude-skill"],
  "files": ["skills/"],
  "license": "MIT"
}
EOF

# 4. publish
git tag skill-{name}-v1.0.0
git push origin skill-{name}-v1.0.0
```

## Adding a New MCP

Scaffold under `mcps/{name}/` with standard `package.json` + `src/`. Then:

```bash
git tag {name}-v1.0.0
git push origin {name}-v1.0.0
```

The publish workflow (`mcps/{name}/.github/workflows/publish.yml`) uses `defaults.run.working-directory: mcps/{name}` so all steps run in the right directory.

---

## CI/CD

### Tag conventions

| What | Tag format | Workflow |
|------|-----------|----------|
| Skill | `skill-{name}-v{semver}` | `.github/workflows/publish-skill.yml` |
| MCP | `{name}-v{semver}` | `mcps/{name}/.github/workflows/publish.yml` |

### How skill publishing works

1. CI parses skill name + version from the tag
2. Bumps `package.json` version, runs `npm publish` from `skills/{name}/`
3. skills.sh auto-indexes the package — it scans npm for `"agent-skill"` keyword, extracts every `skills/**/SKILL.md`

### Required GitHub Secrets

| Secret | Used by |
|--------|---------|
| `NPM_TOKEN` | All publish workflows |
| `JIRA_CLIENT_ID` | jira-dev-mcp only |
| `JIRA_CLIENT_SECRET` | jira-dev-mcp only |

---

## Local Setup

```bash
git clone git@github.com:nianyi778/work-ai-tools.git ~/personage/work-ai-tools

# symlink a skill (no npm needed locally)
ln -s ~/personage/work-ai-tools/skills/jira-defect-analysis/skills/jira-defect-analysis \
      ~/.claude/skills/jira-defect-analysis

# MCP: see mcps/jira-dev-mcp/README.md
```
