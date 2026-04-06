# Claude Code Instructions — jira-dev-mcp

## Critical rule: stop and ask when uncertain

When working on this codebase, if you encounter something you do not understand
and cannot resolve after checking available resources (docs, code, tests):

**STOP. Ask the user explicitly. Do not guess.**

Guessing wastes time with invalid code that looks plausible but is wrong.
A one-sentence clarifying question costs nothing; a wrong implementation costs a review cycle.

Examples of when to ask:
- The intended behavior of a Jira API field is ambiguous
- The correct auth flow for a new OAuth scope is unclear
- A type mismatch has multiple possible fixes with different semantics
- A test failure could mean the test is wrong or the code is wrong — unclear which

## Language

Always respond in Chinese (中文) in this project.

## Workflow

### Step 1 — Read the Jira task completely (mandatory, before touching any code)

- Use `jira_read_task` to fetch the full task content.
- Read **every field without exception**: description, comments, linked issues.
- Use `jira_download_all_attachments` to download **all attachments** at once. No attachment may be skipped.
- Do not proceed until the entire task — including all attachments — is fully read and understood.

### Step 2 — Sync to latest code (mandatory, before reading any code)

```bash
git fetch origin
git checkout <default-branch>   # e.g. main / master / develop — check remote
git pull origin <default-branch>
```

### Step 3 — Read relevant code

Read all files, functions, and APIs related to the task. Understand the current implementation before forming any opinion on the solution.

### Step 4 — Confirm understanding with the user (mandatory, before writing any code)

Clearly present to the user:

1. **任务诉求** — what the task is asking for
2. **当前问题** — what the current issue is and why it exists
3. **实现方案** — proposed solution
4. **改动范围** — which files / functions / APIs will be affected

**Wait for user confirmation.** Discuss until the user explicitly confirms. Do not write code before confirmation.

### Step 5 — Implement

Write the code changes. Stay within the confirmed scope. Do not add unrequested changes.

### Step 6 — Quality checks (mandatory)

```bash
npx tsc --noEmit          # zero TypeScript errors
npm test                  # all tests green
```

- All 9 registered MCP tools must remain functional: `jira_search_issues`, `jira_read_task`,
  `jira_download_attachment`, `jira_my_tasks`, `jira_set_project_path`, `jira_get_project_path`,
  `jira_add_comment`, `jira_edit_comment`, `jira_analyze_task`
- Fix any type errors or lint issues. This prevents CI/CD failures on the remote.

### Step 7 — Self-review (minimum 2 rounds, mandatory)

Use the quality check results to inform the review:

- **Round 1**: Correctness — does the code do exactly what was agreed?
- **Round 2**: Impact scope — are there unintended side effects? Edge cases? Regressions?

If anything is uncertain, **ask the user before proceeding**.

### Step 8 — Wait for user testing confirmation

Ask the user to test the changes. **Do not proceed to Step 9 or Step 10 until the user explicitly confirms their testing has passed.**

### Step 9 — Ask user whether to open a PR

- If **yes**: invoke the `branch-commit-pr` skill to create the branch, commit, and open the PR.
- If **no**: skip this step.

Do not open a PR without explicit user confirmation.

### Step 10 — Post Jira comment

Post the fix summary on the Jira task using `jira_add_comment`. Write in plain language for non-IT staff. No technical jargon.

```
【修复完成】

问题原因：（用一句话说明为什么出现这个问题）
修复内容：（用一句话说明做了什么改动）
验证结果：已验证正常
备注：

---

【修正完了】

発生原因：（問題が発生した理由を一言で）
修正内容：（どのような修正を行ったかを一言で）
確認結果：正常を確認済み
備考：
```
