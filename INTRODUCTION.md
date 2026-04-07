# work-ai-tools 使用说明

> 面向团队内部宣讲——AI 工具链的实际落地价值

---

## 一、我们在解决什么问题

开发同学每天有大量**高重复、低价值**的手工操作：

| 场景 | 手工操作 | 耗时估算 |
|------|---------|---------|
| 处理缺陷单 | 读 Jira → 查代码 → 写分析 → 填 Sheet → 发评论 | 15~30 min/条 |
| 开发中查任务 | 切浏览器 → 搜索 → 复制描述 → 切回 IDE | 3~5 min/次 |
| 缺陷报告归因 | 判断根因类型、填写日文字段、措辞规范化 | 10~20 min/条 |

**work-ai-tools 的目标**：让 AI 接管这些操作，人只做判断和确认。

---

## 二、工具清单

### 1. jira-dev-mcp — Jira × IDE 直连

**是什么**：一个 MCP Server，让 Claude Code / OpenCode 等 AI 编辑器直接读写 Jira，无需切换浏览器。

**安装**（一次性）：

```bash
npx jira-dev-mcp login   # 浏览器授权，token 自动管理
```

**在 Claude Code 里配置**（`~/.claude/claude_desktop_config.json`）：

```json
{
  "mcpServers": {
    "jira": {
      "command": "npx",
      "args": ["-y", "jira-dev-mcp", "mcp"]
    }
  }
}
```

> 使用 `npx -y` 无需手动安装，每次启动自动拉取最新版本。

**能做什么**：

| 操作 | 示例对话 |
|------|---------|
| 搜索任务 | "找一下 AT 项目里和登录相关的 bug" |
| 读取任务详情 | "帮我看下 T-0138 的描述和附件" |
| 解析附件 | 自动读取 Excel/PDF/图片，无需手动下载 |
| 发评论 | "在 T-0138 上回复：已修复，代码在 PR #42" |
| 查我的任务 | "列出我名下所有 In Progress 的任务" |

**价值**：开发过程中，AI 可以**自动读取任务上下文**，理解业务需求再写代码，减少来回确认。

---

### 2. jira-defect-analysis Skill — 缺陷分析自动化

**是什么**：一个 Claude Code Skill，驱动 AI 完成从 Jira 读单 → 查代码 → 归因 → 回填 Sheet 的完整工作流。

**安装**：

```bash
npx skills add @nianyi778/skill-jira-defect-analysis
# 或本地 symlink（团队内部用）
ln -s ~/personage/work-ai-tools/skills/jira-defect-analysis/skills/jira-defect-analysis \
      ~/.claude/skills/jira-defect-analysis
```

**使用方式**：在 Claude Code 里直接说：

```
处理一下我名下的缺陷单
```

AI 会自动：

```
① 读取 Jira 上你名下的所有未处理缺陷
② 逐条分析：读描述 + 读附件（Excel/图片）+ 搜索相关代码
③ 给出归因结论，展示给你确认：
   ┌─────────────────────────────────────────┐
   │ 字段          │ 値           │ 依据      │
   │ 発生原因      │ 仕様変更     │ API废弃   │
   │ 処置区分      │ BUG修正      │ 改URL     │
   │ 詳細発生原因  │ Jiraのシス.. │           │
   └─────────────────────────────────────────┘
④ 你确认后，自动回填 Google Sheet + 在 Jira 发评论
```

**字段自动判断规则**（AI 内置，无需人工）：

| 字段 | 判断逻辑 |
|------|---------|
| 発生原因 | 代码写错→不具合 / 需求变化→仕様変更 / 设计遗漏→設計漏れ |
| 不具合区分 | 接口错误→IF誤り / 逻辑错误→記述誤り / 规格不完整→仕様不備 |
| 詳細字段 | 面向非技术日语母语用户，30字以内，禁止写 API/函数名 |

**价值**：一条缺陷单原来需要 15~30 分钟，现在 **AI 处理 + 人工确认 < 2 分钟**。

---

## 三、工作流对比

### 之前（纯手工）

```
收到缺陷单
    ↓
打开 Jira 浏览器，读描述、评论、附件
    ↓
下载 Excel 附件，用 Numbers/Excel 打开
    ↓
切换到 IDE，搜索相关代码
    ↓
判断根因，在脑子里组织日文措辞
    ↓
打开 Google Sheet，找到对应行，手动填写 6 个字段
    ↓
回到 Jira，写评论，@相关人
    ↓
（15~30 分钟/条）
```

### 现在（AI 接管）

```
在 Claude Code 说："处理缺陷单"
    ↓
AI 自动读取 Jira + 附件 + 代码（3~5 分钟）
    ↓
展示结论，你看一眼确认
    ↓
AI 自动回填 Sheet + 发 Jira 评论
    ↓
（< 2 分钟/条，人工介入只有"确认"这一步）
```

---

## 四、技术架构

```
┌──────────────────────────────────────────────┐
│              Claude Code / OpenCode           │
│                 (AI 编辑器)                   │
└──────┬──────────────────────┬────────────────┘
       │ MCP Protocol          │ Skill
       ▼                       ▼
┌─────────────┐      ┌──────────────────────┐
│ jira-dev-mcp│      │ jira-defect-analysis │
│             │      │                      │
│ • 搜索任务  │      │ • 读 Jira            │
│ • 读详情    │      │ • 查代码             │
│ • 解析附件  │      │ • 归因判断           │
│ • 发评论    │      │ • 回填 Sheet         │
└──────┬──────┘      └──────────┬───────────┘
       │                        │
       ▼                        ▼
  Jira Cloud              Google Sheets
```

---

## 五、发布与维护

工具托管在 `github.com/nianyi778/work-ai-tools`，CI/CD 自动化：

| 操作 | 命令 | 结果 |
|------|------|------|
| 发布新版 MCP | `git tag jira-dev-mcp-v1.4.7` + push | 自动测试 → npm publish |
| 发布新版 Skill | `git tag skill-jira-defect-analysis-v1.0.1` + push | 自动发布 → skills.sh 自动入库 |

**skills.sh 市场**：Skill 发布到 npm 后，[skills.sh](https://skills.sh) 自动发现并收录，团队成员可以直接：

```bash
npx skills add @nianyi778/skill-jira-defect-analysis
```

---

## 六、快速上手（5 分钟）

```bash
# Step 1: 登录 MCP（无需全局安装）
npx jira-dev-mcp login

# Step 2: 安装 Skill
npx skills add @nianyi778/skill-jira-defect-analysis

# Step 3: 在 Claude Code 里说
"处理一下我名下的缺陷单"
```

首次使用会交互式采集配置（Jira URL、项目 Key、Sheet 信息），之后全自动。

---

## 七、后续规划

- [ ] 更多 Skill：Sprint 报告自动生成、PR 描述自动填写
- [ ] 缺陷趋势分析：按模块/工程汇总根因分布
- [ ] 支持更多 MCP 客户端（Cursor、Windsurf）
