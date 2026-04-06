# 授权功能测试指南

## 快速开始

### 1. 启动开发服务器

```bash
npm run dev
```

服务将在 http://localhost:8787 启动

### 2. 测试授权流程

#### 方法 A: 使用预览脚本（快速测试 UI）

```bash
npx tsx test-auth.ts
```

这会生成一个静态 HTML 文件并在浏览器中打开，你可以测试 UI 交互，但 API 调用会失败。

#### 方法 B: 完整测试（推荐）

**步骤 1: 确保有测试用的授权码**

`wrangler.toml` 中已经定义了 SUPER_ADMIN_TOKEN = "888888"

**步骤 2: 创建测试报告**

访问 http://localhost:8787/test/review

或者使用 curl:
```bash
curl http://localhost:8787/test/review
```

这会创建一个测试报告并返回 review URL。

**步骤 3: 访问审查页面**

打开返回的 URL，例如:
```
http://localhost:8787/review/{token}
```

**步骤 4: 测试授权流程**

1. **初始状态**: 页面显示邮件内容，表单可编辑
2. **点击"メールを送信"**: 
   - 如果从未授权过 → 显示授权码输入框
   - 如果已授权（sessionStorage 中有记录）→ 直接显示预览弹窗
3. **输入授权码**: 
   - 使用 `888888`（SUPER_ADMIN_TOKEN）
   - 或任何在 D1 数据库中的有效 token
4. **验证成功**:
   - 授权码保存到 sessionStorage
   - 自动弹出预览弹窗
5. **发送邮件**:
   - 点击"送信する"
   - 请求会附带授权码
   - 后端验证授权码后才发送邮件

### 3. 测试场景

#### 场景 1: 正常流程
```
访问 /review/{token}
→ 点击"メールを送信"
→ 输入 888888
→ 自动弹出预览
→ 点击"送信する"
→ 邮件发送成功
```

#### 场景 2: 错误授权码
```
访问 /review/{token}
→ 点击"メールを送信"
→ 输入 000000
→ 显示"授权码无效，请重试"
→ 可以无限重试
```

#### 场景 3: Session 保持
```
访问 /review/{token}
→ 点击"メールを送信"
→ 输入 888888
→ 自动弹出预览
→ 关闭预览
→ 再次点击"メールを送信"
→ 直接弹出预览（无需再次授权）
```

#### 场景 4: Session 过期
```
已授权状态下
→ 刷新页面（或新开标签页）
→ 点击"メールを送信"
→ 需要重新输入授权码
```

### 4. 创建测试用授权码

如果你需要创建新的授权码（非 SUPER_ADMIN_TOKEN）:

```bash
# 需要先登录（使用 SUPER_ADMIN_TOKEN）
curl -X POST http://localhost:8787/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "code=888888"

# 然后创建新 token
curl -X POST http://localhost:8787/admin/tokens \
  -H "Authorization: Bearer 888888" \
  -H "Content-Type: application/json" \
  -d '{"note": "Test Token"}'
```

或者访问管理界面:
```
http://localhost:8787/login?redirect=/admin/tokens
```

### 5. 检查发送日志

发送邮件后，可以在 D1 数据库中查看日志:

```bash
# 使用 wrangler 查询 D1
wrangler d1 execute jira_monitor_DB --command "SELECT * FROM email_send_logs ORDER BY timestamp DESC LIMIT 10"
```

日志中会记录:
- trigger_type: 'manual'
- operator: 授权码对应的用户（如 'Super Admin' 或 token 的 note）
- success: 是否成功
- review_url: 审查页面 URL

## API 端点

### POST /review/{token}/verify
验证授权码

**Request:**
```json
{
  "code": "888888"
}
```

**Response:**
```json
{
  "success": true,
  "user": "Super Admin"
}
```

### POST /review/{token}/send
发送邮件（需要授权码）

**Request:**
```json
{
  "to": "client@example.com",
  "cc": "manager@example.com",
  "subject": "Test Subject",
  "body": "Test Body",
  "authCode": "888888"
}
```

**Response:**
```json
{
  "success": true
}
```

## 故障排除

### 问题: 授权码验证失败
**检查:**
1. `.dev.vars` 文件中是否配置了正确的 SUPER_ADMIN_TOKEN
2. 或者使用 wrangler.toml 中定义的 888888
3. 检查 token 是否过期（在 D1 中查看）

### 问题: 发送邮件失败
**检查:**
1. 是否提供了有效的 authCode
2. Gmail 配置是否正确（GMAIL_CLIENT_ID, GMAIL_REFRESH_TOKEN 等）
3. 查看日志: `wrangler tail`

### 问题: Session 没有保持
**检查:**
1. 浏览器是否开启了无痕模式（无痕模式下 sessionStorage 仍然有效）
2. 是否手动清除了浏览器数据
3. 检查浏览器开发者工具的 Application → Session Storage

## 开发调试

### 查看前端日志
打开浏览器开发者工具（F12）→ Console

### 查看后端日志
```bash
wrangler tail
```

### 修改测试
编辑 `test-auth.ts` 文件可以自定义测试数据。
