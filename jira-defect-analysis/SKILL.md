---
name: jira-defect-analysis
description: Analyzes software defects by cross-referencing Jira issues with source code, classifying root causes, and backfilling results into a Google Sheet management table. Supports any Jira + Google Sheet + code repository combination. Collects project-specific configuration interactively on first use. Triggers on keywords like defect analysis, code verification, bug triage, or Japanese terms like 不具合分析 and コード検証.
---

# Jira 缺陷分析工作流

## 触发条件

当用户提到以下关键词时使用本 Skill：
- `T-xxxx`、缺陷分析、不具合、コード検証、bug triage
- "处理下一条"、"继续分析"、"回填 Sheet"

## 核心原则

> **每一条都必须：读 Jira 详情（描述+评论+附件）+ 查代码验证，绝不猜测。**
> **附件全看——图片用 Read 工具查看，Excel 用 openpyxl 解析。**
> **必须等用户确认后才能回填。**

## SOP 工作流

### Step 0: 初始化（每个项目首次使用）

检查 `/tmp/defect-config.json` 是否存在。**如果不存在，交互采集以下信息**：

```
初始化采集 Checklist:
- [ ] 0a. Jira 配置
- [ ] 0b. Google Sheet 配置
- [ ] 0c. 代码仓库配置
- [ ] 0d. 回填规则配置
- [ ] 0e. 通知对象配置
- [ ] 0f. 写入配置文件
```

#### 0a. Jira 配置

向用户询问：
1. "Jira 实例 URL 是什么？"（如 `https://xxx.atlassian.net`）
2. "Jira 项目 Key 是什么？"（如 `AT`、`PROJ`）
3. "Jira 凭证怎么获取？"（KeyFlow 项目名 / 环境变量 / 直接提供）

> 如果用户说"KeyFlow"，用 `keyflow_get_env_snippet(project="xxx", mask_values=false)` 获取。

#### 0b. Google Sheet 配置

向用户询问：
1. "缺陷管理表的关键词是什么？"（用于 `searchDriveFiles` 搜索）
2. "用哪个 tab？"（或者"取最新的 tab"）
3. "管理编号在哪一列？"（通常是 B 列）
4. "表头在第几行？数据从第几行开始？"
5. "编号有跳号吗？哪些编号不存在？"

> 也可以让用户直接给 Sheet URL，从中提取 spreadsheetId。

#### 0c. 代码仓库配置

向用户询问：
1. "代码仓库在哪个路径？"
2. "是 monorepo 还是多仓库？大致目录结构是什么？"
3. "主要技术栈？"（Java/TypeScript/Python 等，决定搜索的文件扩展名）

> 也可以直接 `Read` 仓库根目录自动发现结构。

#### 0d. 回填规则配置

向用户询问：
1. "需要回填哪些列？每列的含义和候选值是什么？"
2. "分析结论写在哪一列？格式要求是什么？"
3. "需要设置背景色吗？什么颜色规则？"

> 最佳方式：**让用户给一行已经填好的示例行**，自动推断列映射和格式。
>
> ```
> "给我一行已经完整填好的数据（行号），我来学习你的格式。"
> ```

#### 0e. 通知对象配置

向用户询问：
1. "Jira 评论需要 @mention 谁？"
2. "给我他们的 Jira accountId。"（或者搜 Jira 用户 API 获取）

> 获取 accountId: `GET /rest/api/3/user/search?query=姓名`

#### 0f. 写入配置文件

将采集结果存储为 JSON：

```json
// /tmp/defect-config.json
{
  "jira": {
    "base_url": "https://xxx.atlassian.net",
    "project": "AT",
    "credentials": "keyflow:jira-dev-mcp"
  },
  "sheet": {
    "search_keyword": "不具合管理",
    "spreadsheet_id": "auto",
    "tab": "latest",
    "id_column": "B",
    "header_row": 6,
    "data_start_row": 7,
    "gaps": [69, 126, 187, 224]
  },
  "repo": {
    "path": "/path/to/code",
    "extensions": ["java", "ts", "vue", "tsx"],
    "structure": "monorepo"
  },
  "backfill": {
    "columns": {
      "N": {"name": "発生原因", "candidates": ["不具合", "仕様変更", "設計漏れ", "その他"]},
      "O": {"name": "解決方法", "candidates": ["修正", "追加開発", "設定変更", "対応不要"]},
      "P": {"name": "処置区分", "candidates": ["BUG修正", "仕様変更", "文言修正", "その他"]}
    },
    "analysis_column": "AF",
    "analysis_format": "詳細発生原因：{cause}\n詳細対応方法：{solution}\n詳細影響範囲：{scope}",
    "colors": {"done": "#90EE90", "on_hold": "#FFFACD"}
  },
  "mentions": [
    {"name": "徐哲", "account_id": "5b611abc1865dd73be10f688"}
  ]
}
```

> **配置文件存在后，后续 session 直接加载，不再重复采集。**
> 用户可随时说"更新配置"重新采集某一部分。

### Step 1: 加载配置 & 获取待处理列表

```
Step 1 Checklist:
- [ ] 加载 /tmp/defect-config.json
- [ ] 获取 Jira 凭证
- [ ] 搜索 Google Sheet（如 spreadsheet_id=auto）
- [ ] 读取管理编号列，建立编号→行号映射
- [ ] 搜索 Jira 获取我名下的所有 Issue
- [ ] 交叉比对：哪些已有分析结论（跳过），哪些待处理
```

**Jira 搜索（必须用新 API）**:

```bash
curl -s -X POST -u "$EMAIL:$TOKEN" \
  -H "Content-Type: application/json" \
  "$JIRA_BASE/rest/api/3/search/jql" \
  -d '{"jql":"project=$PROJECT AND assignee=currentUser()","fields":["key","summary","status"],"maxResults":100}' \
  -o /tmp/my-issues.json
```

> **rtk 会过滤 curl JSON 输出**——必须 `-o` 存文件再用 python 解析。

**分类待处理列表**：

| 类型 | 判断条件 | 处理方式 |
|------|---------|---------|
| **正常件** | 分析结论列为空 | → Step 2 完整 SOP |
| **快速件** | 重复单 / ON HOLD | → Step 3 快速通道 |
| **已完成** | 分析结论列非空 | → 跳过 |

### Step 2: 逐条分析（核心循环）

每条 Issue 必须完成以下 checklist，**不可跳步**：

```
[编号] ([Jira Key]) 分析 Checklist:
- [ ] 2a. 读 Jira 完整信息（summary/description/comments/attachments）
- [ ] 2b. 下载并查看所有附件（图片用 Read，Excel 用 openpyxl）
- [ ] 2c. 搜索代码（Grep 关键词 → 定位相关文件）
- [ ] 2d. 阅读关键代码文件（验证问题原因）
- [ ] 2e. 给出分类结论（展示给用户，等待确认）
- [ ] 2f. 用户确认 OK 后执行回填（Sheet + Jira 评论）
- [ ] 2g. 验证回填成功（readSpreadsheet 确认值正确）
```

#### 2a. 读取 Jira 详情

```bash
curl -s -u "$EMAIL:$TOKEN" \
  "$JIRA_BASE/rest/api/3/issue/$KEY?fields=summary,status,assignee,description,comment,attachment,labels" \
  -o /tmp/$KEY.json
```

用 python 解析：详见 [reference/templates.md](reference/templates.md)。

#### 2b. 下载并查看附件

```bash
# 必须加 -L（Jira 附件 URL 有重定向）
curl -s -L -u "$EMAIL:$TOKEN" "$ATTACHMENT_CONTENT_URL" -o /tmp/filename.ext
```

- **图片**: 用 `Read` 工具查看，下载后检查文件大小（<1KB = 失败）
- **Excel**: 用 python + openpyxl 解析（重点看详细内容和期待值字段）
- **不能跳过任何附件**

#### 2c. 搜索代码

根据 Issue 中的功能名/对象系统确定搜索关键词：

```bash
Grep(pattern="关键词", path="$REPO_PATH", include="*.{extensions}")
```

#### 2d. 阅读关键代码

找到相关文件后，用 `Read` 阅读核心逻辑，验证：
- 问题是否真实存在？（还是测试者误判）
- 修复是否已实装？
- 有无 batch job 可能导致数据回退？

#### 2e. 给出分类结论

**必须等用户确认**后才能回填。展示为表格（列名和候选值从配置读取）：

| 字段 | 値 | 依据 |
|------|------|------|
| [列名] | [候选值之一] | [一句话说明] |

加上详细分析文本（按配置的 `analysis_format`）。

#### 2f. 回填

用户确认后，执行三件事：
1. **Sheet batchWrite** — 分类列
2. **Sheet writeSpreadsheet + formatCells** — 分析结论列 + 背景色
3. **Jira POST comment** — ADF 格式 + @mention

模板详见 [reference/templates.md](reference/templates.md)。

#### 2g. 验证回填

```python
readSpreadsheet(range=f"{tab}!{col}{row}")  # 确认每个回填的值正确
```

### Step 3: 快速通道

| 场景 | 处理方式 | 分析结论 | 背景色 |
|------|---------|---------|--------|
| **重复单** | 标记引用对方编号 | `重複単 [引用编号]。[简述]` | done 色 |
| **ON HOLD** | 记录等待原因 | `ON HOLD。[等待谁/什么]` | on_hold 色 |
| **非 BUG 已确认** | 简要说明 | `対応不要。[原因]` | done 色 |

快速件仍需读 Jira 确认状态，但**不需要完整代码验证**。

### Step 4: 进度持久化

每处理完一条，更新 `/tmp/defect-progress.json`。

### Step 5: 报告生成

全部完成后，生成 markdown 报告：构成比统计 + 全件一覧 + 特筆発見 + 改善提案。

## 参考文件

| 文件 | 内容 | 何时读取 |
|------|------|---------|
| [reference/templates.md](reference/templates.md) | Jira 解析脚本、ADF 评论模板、Sheet 回填模板 | 执行回填时 |
| [reference/gotchas.md](reference/gotchas.md) | 已知陷阱与解决方法 | 遇到问题时 |

## 快速参考

```
配置文件:      /tmp/defect-config.json（首次交互采集，后续复用）
进度文件:      /tmp/defect-progress.json
Jira 搜索:     POST /rest/api/3/search/jql（旧 /search 已废弃）
curl 必须:     -o /tmp/xxx.json（rtk 过滤） + -L（附件重定向）
回填后验证:    readSpreadsheet 确认值正确
核心铁律:      读 Jira + 看附件 + 查代码 + 等确认 → 才能回填
```
