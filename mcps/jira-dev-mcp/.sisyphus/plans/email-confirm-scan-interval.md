# Email Send Confirmation + Scan Interval Redesign

## TL;DR

> **Quick Summary**: Add a "我已发送" confirmation button on the review page so the system knows when client emails were actually sent. Change the Jira scanning logic from "today's completed tasks" to "tasks completed since last confirmed send", ensuring no tasks are ever missed between reports.
> 
> **Deliverables**:
> - "我已发送" confirmation button on review page with POST endpoint
> - `lastConfirmedSendTime` stored in KV for persistent scan window tracking
> - Refactored `jira.ts` scanning: `findTodayCompletedSubtasks()` → `findSubtasksCompletedSince(sinceTime)`
> - Updated scheduled handler to use new scan window
> - Confirmation logging in `email_send_logs` D1 table
> - Updated config page email logs to show confirmation events
> 
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 2 waves
> **Critical Path**: Task 1 (scan logic) → Task 3 (scheduled handler) → Task 5 (review page UI)

---

## Context

### Original Request
User identified two problems:
1. When a user clicks mailto on the review page to send client email, the system cannot detect if the email was actually sent (browser security limitation)
2. The scan interval ("today's tasks") means tasks completed after the email is sent but before midnight could be missed in the next day's report

### Interview Summary
**Key Discussions**:
- mailto is fundamentally untrackable — browser provides zero feedback (confirmed by research)
- User chose **Plan B**: keep mailto flow, add manual "我已发送" confirmation button
- Scan interval: change from `isToday()` calendar day → "since `lastConfirmedSendTime`"
- Multiple sends per day: allowed but rare; typically once per day
- Fallback: if no one confirms for days, auto-trigger includes ALL unconfirmed tasks (weekends, holidays)
- Auto-trigger (Cron) does NOT count as "confirmed send" — only manual "我已发送" click

**Research Findings**:
- `isToday()` in `jira.ts:99-115` compares formatted YYYY-MM-DD dates in JST timezone
- `findTodayCompletedSubtasks()` filters Jira changelog for Done transitions matching today
- Jira API changelog has full timestamps — can filter by any time range, not just "today"
- Review page token expires in 24h (configurable) — confirmation state must persist independently
- `email_sent:${todayKey}:manual` KV key is the duplicate-prevention flag — needs careful refactoring

### Metis Review
**Identified Gaps** (addressed):
- Weekend/holiday gap: Monday scan must include Sat+Sun completions → resolved: "all since lastConfirmedSendTime"
- Confirmation auth: review page is public (UUID=auth) → confirm endpoint also public (consistent)
- Double-click idempotency: every click updates timestamp (simpler, user re-confirms = updated)
- **CRITICAL**: `email_sent:${todayKey}:manual` duplicate-prevention flag must be refactored — scan window is no longer "today" based

---

## Work Objectives

### Core Objective
Enable the system to track when client emails are actually sent (via manual confirmation), and use that timestamp to determine which tasks to include in the next report — eliminating the risk of missing tasks between daily runs.

### Concrete Deliverables
- New POST endpoint: `/review/:token/confirm`
- KV key: `lastConfirmedSendTime` (persistent, no TTL)
- Refactored `findSubtasksCompletedSince(sinceTime, timezone)` in `jira.ts`
- Updated `runMonitor()` to accept and use `sinceTime` parameter
- "我已发送" button + toast confirmation on review page
- Updated email logs section to show "confirmed" events
- Updated `/api` endpoint description

### Definition of Done
- [ ] Clicking "我已发送" on review page records confirmation timestamp
- [ ] Next auto/manual trigger scans tasks completed AFTER that timestamp
- [ ] If no confirmation exists (first run), falls back to scanning "today"
- [ ] Weekend gap: Monday scan includes Sat+Sun completed tasks
- [ ] All 165+ existing tests still pass
- [ ] New scan logic handles timezone correctly (JST)

### Must Have
- "我已发送" button on review page (clear, prominent)
- `lastConfirmedSendTime` persisted in KV (survives deploys)
- Scan logic: `sinceTime → now` window using Jira changelog timestamps
- Fallback to "today" if no previous confirmation
- Confirmation events in email_send_logs
- Auto-trigger still respects manual-skip flag (refactored)

### Must NOT Have (Guardrails)
- DO NOT change the mailto flow itself — keep existing "メールを作成" button as-is
- DO NOT make "我已発送" confirmation mandatory — it's optional (user can skip)
- DO NOT change the Cron schedule times (18:30 email, 18:35 slack)
- DO NOT modify test files
- DO NOT introduce new npm dependencies
- DO NOT add OAuth/Gmail API integration (out of scope)
- DO NOT change the internal notification email flow (Resend)
- DO NOT add tracking pixels or hidden email tracking

---

## Verification Strategy

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
>
> ALL tasks in this plan MUST be verifiable WITHOUT any human action.

### Test Decision
- **Infrastructure exists**: YES (vitest)
- **Automated tests**: NO (user constraint: do not modify test files)
- **Framework**: vitest (existing)

### Agent-Executed QA Scenarios (MANDATORY — ALL tasks)

Verification via: Bash (curl) for API endpoints, Playwright for review page UI.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately):
├── Task 1: Refactor jira.ts scan logic (core algorithm change)
└── Task 2: Add /review/:token/confirm endpoint + KV storage (new endpoint)

Wave 2 (After Wave 1):
├── Task 3: Update scheduled handler + runMonitor to use new scan window
├── Task 4: Update review page UI (我已发送 button + JS)
└── Task 5: Update email logs + config page + docs

Wave 3 (After Wave 2):
└── Task 6: Integration verification + existing tests pass
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 1 | None | 3, 6 | 2 |
| 2 | None | 3, 4, 6 | 1 |
| 3 | 1, 2 | 6 | 4, 5 |
| 4 | 2 | 6 | 3, 5 |
| 5 | 2 | 6 | 3, 4 |
| 6 | 3, 4, 5 | None | None (final) |

### Agent Dispatch Summary

| Wave | Tasks | Recommended Agents |
|------|-------|-------------------|
| 1 | 1, 2 | task(category="deep", run_in_background=true) × 2 |
| 2 | 3, 4, 5 | task(category="unspecified-high") + task(category="visual-engineering") |
| 3 | 6 | task(category="quick", load_skills=["playwright"]) |

---

## TODOs

- [ ] 1. Refactor jira.ts: Change scan logic from "today" to "since timestamp"

  **What to do**:
  - Rename `findTodayCompletedSubtasks(subtasks, timezone)` to `findCompletedSubtasksSince(subtasks, sinceTime, timezone)`
  - Change the filtering logic: instead of `isToday(history.created, timezone)`, compare `new Date(history.created) > sinceTime`
  - Keep `isToday()` function (still used by debug endpoint `getSubtasksDebugInfo`)
  - Update `generateParentTaskReport()` to accept optional `sinceTime: Date` parameter
  - If `sinceTime` is not provided, fall back to start-of-today in JST (backward compatible)
  - Update the `getTodayDateJapanese()` usage in report display — report date should show the range (e.g., "2/10 18:30 ~ 2/13 18:30") instead of just "today"
  - Export `findCompletedSubtasksSince` for use in index.ts

  **Must NOT do**:
  - Do NOT remove `isToday()` — still used by debug endpoints
  - Do NOT change `getSubtasksDebugInfo()` or `getIncompleteTasksReport()` — they use different logic
  - Do NOT change the `isDoneStatus()` function

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Core algorithm change with timezone edge cases, needs careful analysis
  - **Skills**: []
    - No special skills needed — pure TypeScript logic

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Tasks 3, 6
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/jira.ts:99-115` — `isToday()` function — current date comparison logic, keep but don't use for new scan
  - `src/jira.ts:140-196` — `findTodayCompletedSubtasks()` — THE function to refactor. Lines 176-177 have the key filter: `isDoneStatus(toStatus) && isToday(history.created, timezone)`
  - `src/jira.ts:235-271` — `generateParentTaskReport()` — calls `findTodayCompletedSubtasks`, needs new `sinceTime` param

  **API/Type References**:
  - `src/types.ts:ParentTaskReport` — return type, no change needed
  - `src/types.ts:DailyReport` — contains `parentReports[]`, no change needed

  **Test References**:
  - `src/jira.test.ts` — DO NOT MODIFY but review to understand expected behavior

  **Acceptance Criteria**:

  Agent-Executed QA Scenarios:

  ```
  Scenario: New function signature works with sinceTime parameter
    Tool: Bash (node/bun REPL)
    Preconditions: Source compiles without error
    Steps:
      1. Run: npx tsc --noEmit
      2. Assert: Exit code 0, no errors in jira.ts
    Expected Result: Clean compilation
    Evidence: Terminal output captured

  Scenario: Existing tests still pass after refactor
    Tool: Bash
    Preconditions: vitest configured
    Steps:
      1. Run: pnpm test
      2. Assert: All 165+ tests pass, 0 failures
    Expected Result: No regressions
    Evidence: Test output captured

  Scenario: Backward compatibility — no sinceTime falls back to today
    Tool: Bash (LSP diagnostics)
    Preconditions: jira.ts refactored
    Steps:
      1. Check LSP diagnostics on src/jira.ts — 0 errors
      2. Check LSP diagnostics on src/index.ts — 0 errors (since it calls generateParentTaskReport)
    Expected Result: Zero type errors
    Evidence: LSP output captured
  ```

  **Commit**: YES (groups with 2)
  - Message: `feat(jira): change scan logic from calendar-day to since-timestamp`
  - Files: `src/jira.ts`
  - Pre-commit: `pnpm test`

---

- [ ] 2. Add confirmation endpoint and KV storage

  **What to do**:
  - Add new POST endpoint: `/review/:token/confirm` in `src/index.ts`
  - This endpoint is PUBLIC (no auth required — UUID token is the auth, consistent with review page)
  - On confirm:
    1. Verify the token exists in KV (valid review page)
    2. Store `lastConfirmedSendTime` in KV: key = `email:lastConfirmedSendTime`, value = ISO timestamp, NO TTL (persists forever)
    3. Log confirmation event in `email_send_logs` D1 table with `trigger_type = 'confirmed'`
    4. Return JSON: `{ success: true, confirmedAt: "ISO timestamp" }`
  - Add helper function `getLastConfirmedSendTime(env: Env): Promise<Date | null>` that reads from KV
  - Add helper function `setLastConfirmedSendTime(env: Env, time: Date): Promise<void>` that writes to KV
  - Handle edge cases:
    - Token doesn't exist → 404 `{ error: "Report not found or expired" }`
    - Token exists but already confirmed → still update timestamp (idempotent, re-click = new timestamp)

  **Must NOT do**:
  - Do NOT require session/bearer auth (review page is public)
  - Do NOT delete or modify the review token after confirmation
  - Do NOT change the existing review page GET endpoint

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: New endpoint with KV state management, must integrate cleanly with existing router
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: Tasks 3, 4, 5, 6
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/index.ts:171-196` — existing `/review/:token` GET handler — pattern for token matching regex and KV retrieval
  - `src/index.ts:451-478` — existing `/api/email/send` POST handler — pattern for JSON response and error handling
  - `src/index.ts:38-54` — `logEmailSend()` function — reuse for logging confirmation events
  - `src/index.ts:28-36` — `getTodayDateKey()` — used for date key in log

  **API/Type References**:
  - `src/types.ts:Env` — env type with REPORT_KV and TOKEN_DB bindings
  - `src/types.ts:StoredReport` — the report structure stored in KV

  **Acceptance Criteria**:

  Agent-Executed QA Scenarios:

  ```
  Scenario: Confirm endpoint returns success for valid token
    Tool: Bash (curl)
    Preconditions: Dev server running on localhost:8787, valid review token exists
    Steps:
      1. GET /manual to generate a report (get reviewUrl from response)
      2. Extract token from reviewUrl
      3. POST /review/{token}/confirm
      4. Assert: HTTP status 200
      5. Assert: response.success === true
      6. Assert: response.confirmedAt is ISO timestamp
    Expected Result: Confirmation recorded
    Evidence: Response body captured

  Scenario: Confirm endpoint returns 404 for invalid token
    Tool: Bash (curl)
    Preconditions: Dev server running
    Steps:
      1. POST /review/nonexistent-token-12345/confirm
      2. Assert: HTTP status 404
      3. Assert: response.error contains "not found"
    Expected Result: 404 error
    Evidence: Response body captured

  Scenario: Confirm endpoint is idempotent (double-click safe)
    Tool: Bash (curl)
    Preconditions: Dev server running, valid token
    Steps:
      1. POST /review/{token}/confirm → get confirmedAt1
      2. Wait 1 second
      3. POST /review/{token}/confirm → get confirmedAt2
      4. Assert: Both return success
      5. Assert: confirmedAt2 > confirmedAt1
    Expected Result: Both succeed, second updates timestamp
    Evidence: Both response bodies captured

  Scenario: lastConfirmedSendTime persisted in KV
    Tool: Bash (wrangler)
    Preconditions: Dev server running, confirmation made
    Steps:
      1. POST /review/{token}/confirm
      2. Read KV key: wrangler kv:key get "email:lastConfirmedSendTime" --binding REPORT_KV --local
      3. Assert: Value is ISO timestamp
    Expected Result: KV key exists with timestamp
    Evidence: KV value captured
  ```

  **Commit**: YES (groups with 1)
  - Message: `feat(api): add email send confirmation endpoint and KV tracking`
  - Files: `src/index.ts`
  - Pre-commit: `pnpm test`

---

- [ ] 3. Update scheduled handler and runMonitor to use new scan window

  **What to do**:
  - In `scheduled()` handler (the email cron branch):
    1. Read `lastConfirmedSendTime` from KV using the helper from Task 2
    2. If exists: pass as `sinceTime` to `runMonitor()`
    3. If not exists: pass `undefined` (fallback to "today")
  - Update `runMonitor()` function signature to accept optional `sinceTime: Date`
  - Pass `sinceTime` through to `generateParentTaskReport()` (from Task 1)
  - **CRITICAL REFACTOR**: The `email_sent:${todayKey}:manual` duplicate-prevention flag:
    - Keep the manual-skip check: if manual was triggered today, auto skips (same as before)
    - But the scan window comes from `lastConfirmedSendTime`, NOT from "today"
    - The auto-trigger logs to `email_send_logs` but does NOT update `lastConfirmedSendTime` (only "我已発送" does that)
  - Update `/api/email/send` (manual trigger from config page):
    - Also read `lastConfirmedSendTime` and pass as `sinceTime`
    - Does NOT update `lastConfirmedSendTime` (only review page confirm does)
  - Update `/manual` endpoint similarly

  **Must NOT do**:
  - Do NOT make auto-trigger update `lastConfirmedSendTime` — only the review page "我已発送" button does this
  - Do NOT remove the existing `email_sent:${todayKey}:manual` skip logic — it prevents auto/manual conflicts same day
  - Do NOT change the Cron schedule

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Integration task connecting Task 1 and Task 2, requires careful state management
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Task 1 + Task 2)
  - **Parallel Group**: Wave 2 (with Tasks 4, 5)
  - **Blocks**: Task 6
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `src/index.ts:84-131` — scheduled handler — THE code to modify. Lines 110-126 are the email cron branch
  - `src/index.ts:117-122` — manual-skip check — KEEP but understand interaction with new scan window
  - `src/index.ts:785-906` — `runMonitor()` function (approximate lines) — needs `sinceTime` parameter
  - `src/index.ts:451-478` — `/api/email/send` handler — needs `sinceTime` from KV
  - `src/index.ts:400-448` — `/manual` endpoint — needs `sinceTime` from KV

  **API/Type References**:
  - New helper `getLastConfirmedSendTime(env)` from Task 2
  - Updated `generateParentTaskReport(parentKey, env, sinceTime?)` from Task 1

  **Acceptance Criteria**:

  Agent-Executed QA Scenarios:

  ```
  Scenario: Auto-trigger uses lastConfirmedSendTime for scan window
    Tool: Bash (curl + wrangler)
    Preconditions: Dev server running
    Steps:
      1. Set lastConfirmedSendTime to 2 days ago via KV:
         wrangler kv:key put "email:lastConfirmedSendTime" "2026-02-11T09:30:00.000Z" --binding REPORT_KV --local
      2. Trigger manual scan: GET /manual
      3. Assert: Response includes tasks from last 2 days (not just today)
    Expected Result: Scan window is since lastConfirmedSendTime
    Evidence: Response body showing task dates

  Scenario: Fallback to today when no lastConfirmedSendTime
    Tool: Bash (curl + wrangler)
    Preconditions: Dev server running, no lastConfirmedSendTime in KV
    Steps:
      1. Delete KV key: wrangler kv:key delete "email:lastConfirmedSendTime" --binding REPORT_KV --local
      2. Trigger manual scan: GET /manual
      3. Assert: Response includes only today's tasks (fallback behavior)
    Expected Result: Falls back to calendar-day scan
    Evidence: Response body captured

  Scenario: Existing tests still pass
    Tool: Bash
    Steps:
      1. Run: pnpm test
      2. Assert: All tests pass
    Expected Result: No regressions
    Evidence: Test output
  ```

  **Commit**: YES
  - Message: `feat(scheduler): use lastConfirmedSendTime for scan window`
  - Files: `src/index.ts`
  - Pre-commit: `pnpm test`

---

- [ ] 4. Add "我已发送" button and JS to review page

  **What to do**:
  - In `src/pages/review.ts`, add a "我已发送" confirmation button BELOW the existing "メールを作成" button
  - Button design:
    - Green gradient (success-like), similar to `.token-create-btn` style
    - Icon: checkmark/send icon
    - Text: "我已发送" (Chinese, consistent with config page language)
    - Initially disabled until user clicks "メールを作成" first (prevent premature confirmation)
  - After clicking "メールを作成" (mailto):
    - Enable the "我已発送" button
    - Show helper text: "邮件客户端已打开。发送完成后，请点击下方按钮确认。"
  - On "我已发送" click:
    - POST to `/review/${token}/confirm`
    - Show loading state
    - On success: show toast "已确认发送", disable button, change text to "✓ 已确认"
    - On error: show error toast, keep button enabled
  - Add CSS for the new button and states
  - The review page is in Japanese (title: 送信確認), but user wants the confirm button text in Chinese — follow the pattern of the config page which uses Chinese

  **Must NOT do**:
  - Do NOT change the existing "メールを作成" button behavior
  - Do NOT make confirmation mandatory (user can close page without confirming)
  - Do NOT change the existing page layout/structure significantly
  - Do NOT add new CSS framework or dependencies

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI change on an existing page with specific styling requirements
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Review page styling must match existing design system

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 3, 5)
  - **Blocks**: Task 6
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - `src/pages/review.ts:470-507` — existing "メールを作成" button and `openMailClient()` JS — add new button AFTER this
  - `src/pages/review.ts:385-405` — form fields section — understand existing layout
  - `src/pages/review.ts:31` — page title "送信確認" — existing Japanese/Chinese mix
  - `src/pages/config.ts:921-939` — `.token-create-btn` CSS — pattern for button gradient style
  - `src/pages/config.ts:1356-1400` — `.toast` CSS — pattern for toast notifications (review page may need its own toast)

  **Documentation References**:
  - `DESIGN_SYSTEM.md` — UI/UX standards for colors, spacing, border-radius

  **Acceptance Criteria**:

  Agent-Executed QA Scenarios:

  ```
  Scenario: 我已发送 button appears on review page
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running, valid review token
    Steps:
      1. Navigate to: http://localhost:8787/review/{token}
      2. Wait for page load (timeout: 5s)
      3. Assert: Button with text "我已发送" is visible
      4. Assert: Button is initially disabled
      5. Screenshot: .sisyphus/evidence/task-4-confirm-button-initial.png
    Expected Result: Button visible but disabled
    Evidence: .sisyphus/evidence/task-4-confirm-button-initial.png

  Scenario: 我已发送 enables after メールを作成 click
    Tool: Playwright
    Preconditions: Dev server running, valid review token
    Steps:
      1. Navigate to review page
      2. Fill in To field if empty
      3. Click "メールを作成" button
      4. Wait 1 second
      5. Assert: "我已発送" button is now enabled
      6. Screenshot: .sisyphus/evidence/task-4-confirm-button-enabled.png
    Expected Result: Button becomes clickable
    Evidence: .sisyphus/evidence/task-4-confirm-button-enabled.png

  Scenario: Clicking 我已発送 shows confirmation toast
    Tool: Playwright
    Preconditions: Dev server running, valid review token, button enabled
    Steps:
      1. Click "我已发送" button
      2. Wait for toast/confirmation message (timeout: 5s)
      3. Assert: Success message visible (contains "已确认")
      4. Assert: Button text changed to "✓ 已确认"
      5. Assert: Button is now disabled
      6. Screenshot: .sisyphus/evidence/task-4-confirm-success.png
    Expected Result: Confirmation shown, button disabled
    Evidence: .sisyphus/evidence/task-4-confirm-success.png
  ```

  **Commit**: YES
  - Message: `feat(review): add email send confirmation button`
  - Files: `src/pages/review.ts`
  - Pre-commit: `pnpm test`

---

- [ ] 5. Update email logs, config page, docs, and API description

  **What to do**:
  - **email_send_logs**: The `trigger_type` column now has a third value: `'confirmed'` (in addition to `'auto'` and `'manual'`)
  - **Config page** (`src/pages/config.ts`):
    - Update the email logs table to show `confirmed` type with a new badge color (e.g., purple/cyan)
    - In `renderEmailLogs()` JS function, add case for `triggerType === 'confirmed'` → badge: "确认发送", color: cyan
  - **Docs page** (`src/pages/docs.ts`):
    - Add docs for new `POST /review/:token/confirm` endpoint
    - Update the email module description to mention confirmation flow
  - **API endpoint** (`/api` in `src/index.ts`):
    - Update cron description to mention scan window is "since last confirmed send"
  - **Home page** (`src/pages/home.ts`):
    - No changes needed (schedule times already updated)

  **Must NOT do**:
  - Do NOT change the D1 schema — `trigger_type TEXT` already accepts any string
  - Do NOT modify test files

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small text/config changes across multiple files
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 3, 4)
  - **Blocks**: Task 6
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - `src/pages/config.ts` — `renderEmailLogs()` JS function (search for `triggerClass`) — add `confirmed` case
  - `src/pages/config.ts` — `.log-badge` CSS classes — add `.log-badge.confirmed` style
  - `src/pages/docs.ts:85-152` — Email module endpoints array — add new endpoint entry
  - `src/index.ts:330-345` — `/api` endpoint JSON — update cron description

  **Acceptance Criteria**:

  Agent-Executed QA Scenarios:

  ```
  Scenario: Email logs show confirmed events with correct badge
    Tool: Bash (curl)
    Preconditions: Dev server running, at least one confirmation recorded
    Steps:
      1. GET /admin/email-logs?days=30
      2. Assert: Response contains logs
      3. Assert: At least one log has triggerType "confirmed"
    Expected Result: Confirmed events appear in logs
    Evidence: Response body captured

  Scenario: Docs page includes new endpoint
    Tool: Bash (curl)
    Preconditions: Dev server running
    Steps:
      1. GET /docs
      2. Assert: HTML contains "/review/:token/confirm"
      3. Assert: HTML contains "确认发送" or "confirm"
    Expected Result: New endpoint documented
    Evidence: Response snippet captured

  Scenario: All tests still pass
    Tool: Bash
    Steps:
      1. Run: pnpm test
      2. Assert: All tests pass
    Expected Result: No regressions
    Evidence: Test output
  ```

  **Commit**: YES
  - Message: `feat(ui): update logs, docs, and API for email confirmation flow`
  - Files: `src/pages/config.ts`, `src/pages/docs.ts`, `src/index.ts`
  - Pre-commit: `pnpm test`

---

- [ ] 6. Integration verification

  **What to do**:
  - Run full test suite: `pnpm test`
  - Check LSP diagnostics on all modified files (0 errors)
  - Run a full end-to-end flow manually via curl:
    1. Trigger manual scan → get review URL
    2. Open review page → verify "我已発送" button exists
    3. Click confirm → verify KV updated
    4. Trigger another scan → verify it only includes tasks after confirm time
  - Verify the config page email logs section loads and shows all event types

  **Must NOT do**:
  - Do NOT deploy to production (leave that to user)
  - Do NOT modify any code (verification only)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Verification-only task, no code changes
  - **Skills**: [`playwright`]
    - `playwright`: Browser-based verification of review page and config page

  **Parallelization**:
  - **Can Run In Parallel**: NO (final verification)
  - **Parallel Group**: Wave 3 (sequential)
  - **Blocks**: None (final task)
  - **Blocked By**: Tasks 3, 4, 5

  **References**:
  - All files modified in Tasks 1-5

  **Acceptance Criteria**:

  Agent-Executed QA Scenarios:

  ```
  Scenario: Full test suite passes
    Tool: Bash
    Steps:
      1. Run: pnpm test
      2. Assert: All tests pass, 0 failures
    Expected Result: Clean test run
    Evidence: Full test output captured

  Scenario: Zero LSP errors across all modified files
    Tool: LSP diagnostics
    Steps:
      1. Check src/jira.ts → 0 errors
      2. Check src/index.ts → 0 errors
      3. Check src/pages/review.ts → 0 errors
      4. Check src/pages/config.ts → 0 errors
      5. Check src/pages/docs.ts → 0 errors
    Expected Result: Zero errors
    Evidence: LSP output for each file

  Scenario: End-to-end flow works
    Tool: Bash (curl) + Playwright
    Preconditions: Dev server running (pnpm dev)
    Steps:
      1. curl GET /manual → extract reviewUrl and token
      2. curl POST /review/{token}/confirm → assert success
      3. curl GET /admin/email-logs → assert "confirmed" event exists
      4. Playwright: navigate to /config#email-logs → assert table shows confirmed event
    Expected Result: Full flow works end-to-end
    Evidence: All response bodies + screenshot
  ```

  **Commit**: NO (verification only)

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1+2 | `feat(jira): change scan logic from calendar-day to since-timestamp` + `feat(api): add email send confirmation endpoint` | `src/jira.ts`, `src/index.ts` | `pnpm test` |
| 3 | `feat(scheduler): use lastConfirmedSendTime for scan window` | `src/index.ts` | `pnpm test` |
| 4 | `feat(review): add email send confirmation button` | `src/pages/review.ts` | `pnpm test` |
| 5 | `feat(ui): update logs, docs, and API for email confirmation flow` | `src/pages/config.ts`, `src/pages/docs.ts`, `src/index.ts` | `pnpm test` |

---

## Success Criteria

### Verification Commands
```bash
pnpm test           # All 165+ tests pass
npx tsc --noEmit    # Zero type errors (if tsconfig strict)
```

### Final Checklist
- [ ] "我已发送" button visible on review page
- [ ] Clicking confirm records `lastConfirmedSendTime` in KV
- [ ] Next scan uses `lastConfirmedSendTime` as start of window
- [ ] Fallback to "today" when no previous confirmation
- [ ] Weekend/holiday: Monday scan includes unconfirmed Sat+Sun tasks
- [ ] Auto-trigger does NOT update `lastConfirmedSendTime`
- [ ] Manual-skip flag still works (manual today → auto skips)
- [ ] email_send_logs shows "confirmed" events
- [ ] Config page email logs shows confirmed badge
- [ ] Docs page documents new endpoint
- [ ] All existing tests pass
- [ ] Zero LSP errors
