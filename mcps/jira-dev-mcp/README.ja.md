# jira-dev-mcp

Jira Cloud 連携のローカル MCP サーバー。Claude Code、OpenCode、Codex などの MCP クライアントから Jira の Issue 検索、タスク詳細読み込み、添付ファイル解析、ローカルリポジトリとのマッピングができます。

[![npm version](https://img.shields.io/npm/v/jira-dev-mcp.svg)](https://www.npmjs.com/package/jira-dev-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**他の言語：** [English](README.md) · [中文](README.zh.md)

## 機能

- キーワードまたは生の JQL で Issue を検索
- タスクの全詳細を取得：説明、サブタスク、変更履歴、コメント、添付ファイル一覧
- Python で CSV、XLSX、XLS、PDF 添付ファイルを解析
- 画像・バイナリファイルは base64 で AI クライアントに返却
- Jira プロジェクトキーとローカルリポジトリパスのマッピング
- OAuth 2.0 (3LO) ブラウザログイン — トークンの手動管理不要
- OAuth トークンの有効期限前に自動リフレッシュ
- Issue へのコメント投稿、クリッカブルな URL を返却
- コメント投稿はデフォルトで手動確認。自動送信モードにも設定可能
- 既存コメントの編集にも対応し、同じ確認フローを利用可能
- 一時的な API エラー（429/503）の自動リトライ（Retry-After ヘッダー対応）
- 完全な ADF 解析：コードブロック、テーブル、メンション、リンク、パネル等
- コメント投稿で複数段落およびフェンスドコードブロックをサポート
- 型付きエラー階層によるプログラマティックなエラーハンドリング
- OAuth コールバックポートの自動フォールバック
- Jira への読み書きアクセス

## インストール

```bash
npm install -g jira-dev-mcp
```

## 認証設定

### 方法 A：OAuth 2.0（推奨）

次のコマンドを実行するだけです：

```bash
jira-dev login
```

ブラウザが自動的に開き Jira 認証画面が表示されます。認証後、トークンは `~/.jira-dev/config.json` に保存され、有効期限前に自動更新されます。Client ID や Secret の手動設定は不要です。

> **上級者向け**：独自の OAuth アプリを使用する場合は、`jira-dev login` の前に `JIRA_CLIENT_ID` と `JIRA_CLIENT_SECRET` を設定してください。

### 方法 B：API トークン（Basic 認証）

```bash
export JIRA_BASE_URL="https://your-domain.atlassian.net"
export JIRA_EMAIL="you@example.com"
export JIRA_TOKEN="your-jira-api-token"
```

macOS キーチェーンへの保存（推奨）：

```bash
security add-generic-password -a "$USER" -s "jira-dev-mcp:JIRA_TOKEN" -w "your-token"
```

## MCP クライアント設定

### 自動登録（最も簡単）

```bash
jira-dev setup
```

`~/.claude.json`（Claude Code）と `~/.opencode/config.json`（OpenCode）を自動で作成または更新します。
既存の設定ファイルが不正な JSON の場合、`jira-dev setup` は黙ってスキップせず明示的にエラーを返します。

### 手動設定 — Claude Code（`~/.claude.json`）

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

### 手動設定 — OpenCode / Codex

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

## ツール一覧

| ツール | 説明 |
|--------|------|
| `jira_search_issues` | キーワードまたは JQL で検索 |
| `jira_read_task` | Issue の全詳細を取得 |
| `jira_download_attachment` | 添付ファイルをダウンロード・解析 |
| `jira_my_tasks` | 自分に割り当てられたタスク一覧 |
| `jira_add_comment` | コメントを投稿、クリッカブルな URL を返却 |
| `jira_edit_comment` | 既存コメントを編集。プレビュー確認フロー対応 |
| `jira_set_project_path` | Jira プロジェクトとローカルパスをマッピング |
| `jira_get_project_path` | プロジェクトのローカルパスを取得 |
| `jira_analyze_task` | 完全な調査ワークフロー：Issue・コメント・添付ファイルを読み込み、タイプ別テンプレート（Bug/Story/Task）を選択し、探索→計画→実装→コメント投稿の SOP をガイド |

## CLI コマンド

```bash
jira-dev status    # 現在の認証状態、トークン状態、プロジェクトマッピングを表示
jira-dev doctor    # 環境と設定のヘルスチェックを実行
jira-dev upgrade   # npm から jira-dev-mcp を更新
jira-dev setup     # 対応する MCP クライアントへ jira-dev を登録
jira-dev config set-comment-mode manual   # コメント送信前の確認モードを設定
```

## 標準的な使用フロー

**ステップ 1 — 初回設定：プロジェクトパスのマッピング**

```
jira_set_project_path(jiraProject: "AT", localPath: "/path/to/your/repo")
```

**ステップ 2 — 担当タスクを確認**

```
jira_my_tasks(status: "In Progress")
```

またはキーワード / JQL で検索：

```
jira_search_issues(query: "ログインタイムアウト バグ")
jira_search_issues(query: "project = AT AND sprint in openSprints()")
```

**ステップ 3 — タスク詳細を読み込む**

```
jira_read_task(key: "AT-123", includeComments: true)
```

返却内容：説明、サブタスク、変更履歴、コメント、添付ファイル一覧、ローカルリポジトリパス。

**ステップ 4 — 必要に応じて添付ファイルをダウンロード**

```
jira_download_attachment(key: "AT-123", filename: "spec.xlsx")
```

CSV / XLSX / XLS / PDF は構造化テキストとして解析されます。画像は base64 で返却。

**ステップ 5 — AI が修正を実装**

タスク詳細とローカルリポジトリパスを踏まえて Claude Code に依頼：

- 根本原因の分析
- 修正方針と影響範囲の提案
- 修正の実装
- テストケースの作成

## セキュリティ

- OAuth トークンは `~/.jira-dev/config.json` に保存（パーミッション `600`）
- API トークンは環境変数または macOS キーチェーン推奨
- ダウンロード前にファイルサイズと MIME タイプのホワイトリストを検証
- OAuth クライアント資格情報はビルド時に注入 — ソースコードにはコミットされない
- 機密情報はログに出力しない

## ローカル開発

```bash
git clone https://github.com/nianyi778/jira-dev-mcp.git
cd jira-dev-mcp
npm install
npm run generate-defaults   # 初回ビルド前に必須（環境変数から読み取り、または空のプレースホルダーを使用）
npm test
npm run build
```

インタラクティブなデバッグ：

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

## ライセンス

MIT
