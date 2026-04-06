import type { IssueDetail, ResponseFormat } from './types.js';
import { appendWarnings, jsonText } from './format-common.js';

type IssueCategory = 'bug' | 'story' | 'task';

function getIssueCategory(issueType: string | null): IssueCategory {
  if (!issueType) return 'task';
  const lower = issueType.toLowerCase();
  if (lower.includes('bug') || lower.includes('defect') || lower.includes('error') || lower.includes('incident')) {
    return 'bug';
  }
  if (lower.includes('story') || lower.includes('feature') || lower.includes('epic') || lower.includes('improvement') || lower.includes('enhancement')) {
    return 'story';
  }
  return 'task';
}

function buildAnalysisTemplate(key: string, category: IssueCategory): string[] {
  const lines: string[] = [];

  if (category === 'bug') {
    lines.push(`【${key}】バグ修正分析`);
    lines.push('');
    lines.push('■ 根本原因（Root Cause）');
    lines.push('  発生箇所：');
    lines.push('  原因：');
    lines.push('');
    lines.push('■ 再現手順（Reproduction Steps）');
    lines.push('  1. ');
    lines.push('  2. ');
    lines.push('  3. ');
    lines.push('');
    lines.push('■ 解決方案（Fix）');
    lines.push('  修正内容：');
    lines.push('  変更ファイル（実装済）：');
    lines.push('');
    lines.push('■ 影響範囲（Impact Analysis）');
    lines.push('  影響モジュール：');
    lines.push('  リスク評価：低 / 中 / 高');
    lines.push('');
    lines.push('■ 回帰テストケース（Regression Test Cases）');
    lines.push('  1. ');
    lines.push('  2. ');
    lines.push('  3. ');
    lines.push('');
    lines.push('■ 発生原因：実装ミス / 仕様誤解');
    lines.push('■ 解決方法：修正対応');
    lines.push('■ 処置区分：PG修正');
    lines.push('■ 不具合区分：制御不正 / 表示不正 / データ不正');
    lines.push('■ 作り込み工程：実装 / 設計');
    lines.push('■ 発見すべき工程：単体テスト / コードレビュー');
    lines.push('■ 備考：');
  } else if (category === 'story') {
    lines.push(`【${key}】機能実装分析`);
    lines.push('');
    lines.push('■ 要件理解（Requirements）');
    lines.push('  目的：');
    lines.push('  受け入れ条件（AC）：');
    lines.push('');
    lines.push('■ 実装方針（Design）');
    lines.push('  アーキテクチャ：');
    lines.push('  変更ファイル（実装済）：');
    lines.push('');
    lines.push('■ 影響範囲（Impact Analysis）');
    lines.push('  影響モジュール：');
    lines.push('  リスク評価：低 / 中 / 高');
    lines.push('');
    lines.push('■ テストケース（Test Cases）');
    lines.push('  1. ');
    lines.push('  2. ');
    lines.push('  3. ');
    lines.push('');
    lines.push('■ 解決方法：機能追加');
    lines.push('■ 処置区分：PG修正');
    lines.push('■ 作り込み工程：設計 / 実装');
    lines.push('■ 発見すべき工程：コードレビュー / 結合テスト');
    lines.push('■ 備考：');
  } else {
    lines.push(`【${key}】タスク実装分析`);
    lines.push('');
    lines.push('■ 根本原因（Root Cause）');
    lines.push('  - ');
    lines.push('');
    lines.push('■ 解決方案（Solution）');
    lines.push('  実装内容：');
    lines.push('  変更ファイル（実装済）：');
    lines.push('');
    lines.push('■ 影響範囲（Impact Analysis）');
    lines.push('  影響モジュール：');
    lines.push('  リスク評価：低 / 中 / 高');
    lines.push('');
    lines.push('■ 回帰テストケース（Regression Test Cases）');
    lines.push('  1. ');
    lines.push('  2. ');
    lines.push('  3. ');
    lines.push('');
    lines.push('■ 発生原因：実装ミス / 仕様誤解');
    lines.push('■ 解決方法：修正対応');
    lines.push('■ 処置区分：PG修正');
    lines.push('■ 不具合区分：制御不正 / 表示不正 / データ不正');
    lines.push('■ 作り込み工程：実装 / 設計');
    lines.push('■ 発見すべき工程：単体テスト / コードレビュー');
    lines.push('■ 備考：');
  }

  return lines;
}

export function formatAnalysisWorkflow(
  responseFormat: ResponseFormat,
  payload: {
    issue: IssueDetail;
    project: { key: string; localPath: string | null; needsUserInput: boolean };
    autoComment: boolean;
    existingAnalysisCommentId: string | null;
    warnings?: string[];
  }
): string {
  if (responseFormat === 'json') {
    return jsonText(payload);
  }

  const { issue, project, autoComment, existingAnalysisCommentId } = payload;
  const category = getIssueCategory(issue.issueType);
  const lines: string[] = [];

  lines.push(`# Task Analysis Workflow: ${issue.key}`);
  lines.push('');
  lines.push(`**Summary**: ${issue.summary}`);
  lines.push(`**Status**: ${issue.status || 'Unknown'}`);
  lines.push(`**Type**: ${issue.issueType || 'Unknown'} (category: ${category})`);
  lines.push(`**Priority**: ${issue.priority || 'Unknown'}`);
  lines.push(`**Assignee**: ${issue.assignee || 'Unassigned'}`);
  if (issue.parent) {
    lines.push(`**Parent**: ${issue.parent.key} — ${issue.parent.summary || ''}`);
  }
  lines.push('');

  // Idempotency warning
  if (existingAnalysisCommentId) {
    lines.push(`⚠️ **Analysis already posted** (comment ID: \`${existingAnalysisCommentId}\`).`);
    lines.push(`  To update it, use \`jira_edit_comment\` with commentId="${existingAnalysisCommentId}" instead of posting a duplicate.`);
    lines.push('');
  }

  lines.push('## Issue Description');
  lines.push(issue.descriptionPlainText || '(no description)');
  lines.push('');

  if (issue.linkedIssues.length > 0) {
    lines.push(`## Linked Issues (${issue.linkedIssues.length})`);
    lines.push('> Consider impact on these related issues when assessing scope.');
    for (const linked of issue.linkedIssues) {
      lines.push(`- **${linked.key}** [${linked.relation}] ${linked.summary} — ${linked.status || 'Unknown'}`);
    }
    lines.push('');
  }

  if (issue.attachments.length > 0) {
    lines.push(`## Attachments (${issue.attachments.length})`);
    lines.push('> **Required in Step 1**: Download relevant files before analyzing (logs, screenshots, specs).');
    for (const att of issue.attachments) {
      lines.push(`- ${att.filename} (${att.mimeType}, ${att.size} bytes)`);
    }
    lines.push('');
  }

  if (issue.subtasks.length > 0) {
    lines.push(`## Subtasks (${issue.subtasks.length})`);
    for (const sub of issue.subtasks) {
      lines.push(`- ${sub.key} ${sub.summary} [${sub.status || 'Unknown'}]`);
    }
    lines.push('');
  }

  if (issue.comments.enabled && issue.comments.items.length > 0) {
    lines.push(`## Prior Comments (${issue.comments.items.length}/${issue.comments.total})`);
    lines.push('> Review these before analyzing — they may contain prior investigation or decisions.');
    lines.push('');
    for (const c of issue.comments.items) {
      lines.push(`**${c.author || 'Unknown'}** @ ${c.created}:`);
      lines.push(c.bodyPlainText || '(empty)');
      lines.push('');
    }
  }

  lines.push('---');
  lines.push('');
  lines.push('## Analysis Template');
  lines.push('');
  lines.push('Complete all sections based on your code investigation, then post as a comment.');
  lines.push('');
  lines.push('```');
  for (const l of buildAnalysisTemplate(issue.key, category)) {
    lines.push(l);
  }
  lines.push('```');
  lines.push('');

  lines.push('---');
  lines.push('');
  lines.push('## Workflow Instructions');
  lines.push('');

  if (project.needsUserInput) {
    lines.push(`⚠️ **Local path not configured for project ${project.key}.**`);
    lines.push(`Call \`jira_set_project_path\` with jiraProject="${project.key}" and localPath="<absolute path>" to enable code analysis, then retry.`);
  } else {
    if (issue.attachments.length > 0) {
      lines.push('**Step 0 — Download relevant attachments** (required before code analysis)');
      lines.push('  Call `jira_download_attachment` for any logs, error reports, or spec files listed above.');
      lines.push('');
    }

    lines.push(`**Step 1 — Explore code** at \`${project.localPath}\``);
    lines.push(`  Focus on files related to: "${issue.summary}"`);
    if (issue.linkedIssues.length > 0) {
      const linkedKeys = issue.linkedIssues.map((l) => l.key).join(', ');
      lines.push(`  Also consider impact on linked issues: ${linkedKeys}`);
    }
    lines.push('  Identify root cause, affected code paths, and upstream/downstream impact.');
    lines.push('');

    lines.push('**Step 2a — Plan**: Fill in the Analysis Template above (all sections)');
    if (category === 'bug') {
      lines.push('  - Root cause: the exact file/function/line where the bug originates');
      lines.push('  - Reproduction steps: precise sequence that triggers the issue');
    } else if (category === 'story') {
      lines.push('  - Requirements: confirm your understanding of the acceptance criteria');
      lines.push('  - Design: architecture decisions and module boundaries');
    } else {
      lines.push('  - Root cause: what exactly in the code needs changing and why');
      lines.push('  - Solution: specific files and changes needed');
    }
    lines.push('  - Impact: affected modules, risk level (低/中/高)');
    lines.push('  - Test cases: at minimum 3 verifiable scenarios');
    lines.push('');

    lines.push('**Step 2b — Baseline**: Run existing tests BEFORE editing any code');
    lines.push('  Record current pass/fail state as baseline for comparison after the fix.');
    lines.push('');

    lines.push('**Step 2c — Implement**: Apply the code changes from Step 2a');
    lines.push('  - Edit the identified files');
    lines.push('  - Verify build passes (e.g. `npx tsc --noEmit` for TypeScript projects)');
    lines.push('  - Run tests again and confirm they pass (or new failures are expected and documented)');
    lines.push('  - Update the template "変更ファイル（実装済）" with actual changed files');
    lines.push('');

    if (existingAnalysisCommentId) {
      lines.push(`**Step 3 — Update existing comment**: Call \`jira_edit_comment\` with:`);
      lines.push(`  - key: "${issue.key}"`);
      lines.push(`  - commentId: "${existingAnalysisCommentId}"`);
      lines.push('  - body: <completed analysis template>');
    } else if (autoComment) {
      lines.push(`**Step 3 — Post comment automatically**: Call \`jira_add_comment\` with:`);
      lines.push(`  - key: "${issue.key}"`);
      lines.push('  - body: <completed analysis template including actual changed files>');
      lines.push('  Do not ask the user for confirmation — proceed directly after completing Steps 1–2c.');
    } else {
      lines.push(`**Step 3 — Present analysis and implementation summary** to the user for review before posting.`);
    }
  }

  appendWarnings(lines, payload.warnings);
  return lines.join('\n');
}
