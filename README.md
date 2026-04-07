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
| MCP | `{mcp-name}-v{semver}` | `.github/workflows/publish-{mcp-name}.yml` |

> **不需要手动改 package.json 版本**——两个 workflow 都从 tag 自动提取版本号并 bump。

### Skill 发布流程

1. 从 tag 解析 skill 名称和版本号
2. `npm version {ver} --no-git-tag-version` 更新 `package.json`
3. `npm publish` 发布到 `@nianyi778/skill-{name}`
4. skills.sh 自动扫描 npm（关键词 `agent-skill`），提取 `skills/**/SKILL.md` 入库

### MCP 发布流程

1. 从 tag 解析版本号
2. `npm version {ver} --no-git-tag-version` 更新 `package.json`
3. `npm ci` → 生成内置凭证 → `npm test` → `npm run build` → `npm publish`

### Required GitHub Secrets

| Secret | Used by |
|--------|---------|
| `NPM_TOKEN` | 所有 publish workflows |
| `JIRA_CLIENT_ID` | jira-dev-mcp only |
| `JIRA_CLIENT_SECRET` | jira-dev-mcp only |

---

## 安装

### 给人类看的

复制以下提示词，粘贴到你的 LLM Agent（Claude Code、Cursor 等）：

```
请按照这里的说明安装 work-ai-tools 环境：
https://raw.githubusercontent.com/nianyi778/work-ai-tools/main/SETUP.md
```

或者你也可以直接阅读 [安装指南](./SETUP.md)，但说真的，让 Agent 去干吧。人类配环境总是容易敲错字母。

### 给 LLM Agent 看的

获取安装指南并照做：

```bash
curl -s https://raw.githubusercontent.com/nianyi778/work-ai-tools/main/SETUP.md
```
