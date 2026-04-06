# jira-dev-mcp

本地 MCP 服务器，用于 Jira Cloud 驱动的开发工作流。支持 Claude Code、OpenCode、Codex 等 MCP 客户端搜索 Issue、读取任务详情、解析附件，并将 Jira 项目映射到本地代码仓库。

[![npm version](https://img.shields.io/npm/v/jira-dev-mcp.svg)](https://www.npmjs.com/package/jira-dev-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**其他语言：** [English](README.md) · [日本語](README.ja.md)

## 功能

- 支持自然语言关键词或原生 JQL 搜索 Issue
- 读取完整任务详情：描述、子任务、变更记录、评论、附件列表
- 通过 Python 解析 CSV、XLSX、XLS、PDF 附件
- 图片和二进制文件以 base64 返回给 AI 客户端
- 将 Jira 项目 Key 映射到本地仓库路径
- OAuth 2.0 (3LO) 浏览器登录，无需手动管理 Token
- OAuth Token 过期前自动刷新
- 支持在 Issue 上发表评论，返回可直接跳转的评论 URL
- 评论默认手动确认后发送，也可配置为自动发送
- 支持修改已有评论，并复用相同的确认流程
- 遇到限流/服务异常（429/503）自动重试，支持 Retry-After 头
- 完整 ADF 解析：代码块、表格、@提及、链接、面板等
- 评论支持多段落和围栏代码块
- 类型化错误体系，便于程序化错误处理
- OAuth 回调端口自动降级（默认端口占用时自动尝试其他端口）
- 支持读写 Jira 权限

## 安装

```bash
npm install -g jira-dev-mcp
```

## 认证配置

### 方式 A：OAuth 2.0（推荐）

直接运行：

```bash
jira-dev login
```

浏览器自动打开 Jira 授权页面，授权完成后 Token 自动保存到 `~/.jira-dev/config.json` 并在过期前自动刷新。无需手动配置 Client ID 或 Secret。

> **高级用法**：如需使用自己的 OAuth 应用，在运行 `jira-dev login` 前设置 `JIRA_CLIENT_ID` 和 `JIRA_CLIENT_SECRET`。

### 方式 B：API Token（Basic Auth）

```bash
export JIRA_BASE_URL="https://your-domain.atlassian.net"
export JIRA_EMAIL="you@example.com"
export JIRA_TOKEN="你的-jira-api-token"
```

macOS 用户可将 Token 存入 Keychain：

```bash
security add-generic-password -a "$USER" -s "jira-dev-mcp:JIRA_TOKEN" -w "你的-token"
```

## MCP 客户端配置

### 自动注册（最简单）

```bash
jira-dev setup
```

自动创建或更新 `~/.claude.json`（Claude Code）和 `~/.opencode/config.json`（OpenCode）。
如果现有配置文件不是合法 JSON，`jira-dev setup` 会明确报错，而不是静默跳过。

### 手动配置 — Claude Code（`~/.claude.json`）

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

### 手动配置 — OpenCode / Codex

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

## 工具列表

| 工具 | 说明 |
|------|------|
| `jira_search_issues` | 关键词或 JQL 搜索 |
| `jira_read_task` | 读取 Issue 完整详情 |
| `jira_download_attachment` | 下载并解析附件 |
| `jira_my_tasks` | 列出分配给自己的任务 |
| `jira_add_comment` | 发表评论，返回可直达的评论 URL |
| `jira_edit_comment` | 修改已有评论，支持预览后确认 |
| `jira_set_project_path` | 映射 Jira 项目到本地仓库路径 |
| `jira_get_project_path` | 查询项目的本地路径 |
| `jira_analyze_task` | 完整调查工作流：读取 Issue + 评论 + 附件，按类型（Bug/Story/Task）选择分析模板，引导完成探查 → 计划 → 实现 → 发表评论的全流程 |

## CLI 命令

```bash
jira-dev status    # 查看当前认证状态、Token 状态和项目映射
jira-dev doctor    # 执行环境与配置健康检查
jira-dev upgrade   # 从 npm 升级 jira-dev-mcp
jira-dev setup     # 向支持的 MCP 客户端注册 jira-dev
jira-dev config set-comment-mode manual   # 设置评论发送前是否需要确认
```

## 标准使用流程

**第 1 步 — 一次性配置：映射项目路径**

```
jira_set_project_path(jiraProject: "AT", localPath: "/path/to/your/repo")
```

**第 2 步 — 找到当前任务**

```
jira_my_tasks(status: "In Progress")
```

或按关键词 / JQL 搜索：

```
jira_search_issues(query: "登录超时 bug")
jira_search_issues(query: "project = AT AND sprint in openSprints()")
```

**第 3 步 — 读取任务详情**

```
jira_read_task(key: "AT-123", includeComments: true)
```

返回：描述、子任务、变更记录、评论、附件列表，以及本地仓库路径。

**第 4 步 — 按需下载附件**

```
jira_download_attachment(key: "AT-123", filename: "spec.xlsx")
```

CSV / XLSX / XLS / PDF 解析为结构化文本；图片以 base64 返回。

**第 5 步 — AI 实现修复**

结合任务详情和本地仓库路径，让 Claude Code：

- 分析根本原因
- 制定修改方案及影响范围
- 实现修复
- 编写测试用例

## 安全说明

- OAuth Token 存储在 `~/.jira-dev/config.json`，文件权限为 `600`
- API Token 优先使用环境变量或 macOS Keychain，避免明文写入配置文件
- 下载附件前强制校验文件大小和 MIME 类型白名单
- OAuth 客户端凭据在编译时注入，不会提交到源码中
- 敏感信息不写入任何日志

## 本地开发

```bash
git clone https://github.com/nianyi778/jira-dev-mcp.git
cd jira-dev-mcp
npm install
npm run generate-defaults   # 首次构建前必须执行（从环境变量读取或使用空占位符）
npm test
npm run build
```

交互式调试工具：

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

## 许可证

MIT
