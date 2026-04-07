# work-ai-tools 环境安装

请按顺序执行以下所有步骤，自动完成环境安装。每步执行后验证结果，失败则报告错误。

## 你需要做的事

依次执行以下命令，全程自动，只有 Step 7 OAuth 授权需要我点击浏览器，其余不用打扰我。

---

**Step 1 — Homebrew**
```bash
which brew || /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

**Step 2 — Node.js**
```bash
which node || brew install node
node --version
```

**Step 3 — Python 3**
```bash
which python3 || brew install python3
python3 --version
```

**Step 4 — Python 包**
```bash
pip3 install --quiet openpyxl xlrd pdfplumber
python3 -c "import openpyxl, xlrd, pdfplumber; print('OK')"
```

**Step 5 — 注册 jira-dev-mcp 到 Claude Code**
```bash
npx jira-dev-mcp setup
```

**Step 6 — 健康检查**
```bash
npx jira-dev-mcp doctor
```

**Step 7 — Jira OAuth 授权（唯一需要人工的步骤）**
```bash
npx jira-dev-mcp login
```
> 浏览器会自动弹出，点"允许"即可，之后自动继续。

**Step 8 — 安装 skill**
```bash
npx skills add @nianyi778/skill-jira-defect-analysis -g -y
```

**Step 9 — 验证**
```bash
npx jira-dev-mcp doctor
ls ~/.claude/skills/ | grep jira
```

全部绿色后告诉我"安装完成"。
