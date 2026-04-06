import { describe, expect, it } from 'vitest';
import { formatAnalysisWorkflow } from './format-analysis.js';
import type { IssueDetail } from './types.js';

function makeIssue(issueType: string | null): IssueDetail {
  return {
    key: 'AT-101',
    summary: 'Fix login behavior',
    descriptionPlainText: 'Login fails after callback',
    status: 'In Progress',
    assignee: 'Kai Li',
    issueType,
    priority: 'High',
    labels: ['auth'],
    parent: null,
    subtasks: [],
    linkedIssues: [],
    attachments: [],
    comments: {
      enabled: true,
      startAt: 0,
      maxResults: 20,
      total: 0,
      items: [],
    },
    changelog: {
      startAt: 0,
      maxResults: 20,
      total: 0,
      items: [],
    },
  };
}

describe('formatAnalysisWorkflow', () => {
  it('uses bug template for bug issue type', () => {
    const text = formatAnalysisWorkflow('markdown', {
      issue: makeIssue('Bug'),
      project: { key: 'AT', localPath: '/tmp/backend', needsUserInput: false },
      autoComment: false,
      existingAnalysisCommentId: null,
    });

    expect(text).toContain('【AT-101】バグ修正分析');
  });

  it('uses story template for story issue type', () => {
    const text = formatAnalysisWorkflow('markdown', {
      issue: makeIssue('Story'),
      project: { key: 'AT', localPath: '/tmp/backend', needsUserInput: false },
      autoComment: false,
      existingAnalysisCommentId: null,
    });

    expect(text).toContain('【AT-101】機能実装分析');
  });

  it('uses task template for task issue type', () => {
    const text = formatAnalysisWorkflow('markdown', {
      issue: makeIssue('Task'),
      project: { key: 'AT', localPath: '/tmp/backend', needsUserInput: false },
      autoComment: false,
      existingAnalysisCommentId: null,
    });

    expect(text).toContain('【AT-101】タスク実装分析');
  });

  it('includes idempotency warning when existing analysis comment exists', () => {
    const text = formatAnalysisWorkflow('markdown', {
      issue: makeIssue('Bug'),
      project: { key: 'AT', localPath: '/tmp/backend', needsUserInput: false },
      autoComment: true,
      existingAnalysisCommentId: 'c123',
    });

    expect(text).toContain('⚠️ **Analysis already posted** (comment ID: `c123`).');
    expect(text).toContain('jira_edit_comment');
  });

  it('includes local path hint when project localPath is set', () => {
    const text = formatAnalysisWorkflow('markdown', {
      issue: makeIssue('Task'),
      project: { key: 'AT', localPath: '/Users/dev/project', needsUserInput: false },
      autoComment: false,
      existingAnalysisCommentId: null,
    });

    expect(text).toContain('**Step 1 — Explore code** at `/Users/dev/project`');
  });

  it('shows jira_set_project_path prompt when project needs user input', () => {
    const text = formatAnalysisWorkflow('markdown', {
      issue: makeIssue('Task'),
      project: { key: 'AT', localPath: null, needsUserInput: true },
      autoComment: false,
      existingAnalysisCommentId: null,
    });

    expect(text).toContain('Local path not configured for project AT');
    expect(text).toContain('jira_set_project_path');
  });

  it('returns valid JSON in json format', () => {
    const payload = {
      issue: makeIssue('Bug'),
      project: { key: 'AT', localPath: '/tmp/backend', needsUserInput: false },
      autoComment: true,
      existingAnalysisCommentId: null,
      warnings: ['token expiring'],
    };

    const json = formatAnalysisWorkflow('json', payload);
    const parsed: unknown = JSON.parse(json);
    expect(parsed).toEqual(payload);
  });

  it('markdown format includes workflow instructions section', () => {
    const text = formatAnalysisWorkflow('markdown', {
      issue: makeIssue('Bug'),
      project: { key: 'AT', localPath: '/tmp/backend', needsUserInput: false },
      autoComment: true,
      existingAnalysisCommentId: null,
    });

    expect(text).toContain('## Workflow Instructions');
    expect(text).toContain('**Step 2b — Baseline**');
    expect(text).toContain('**Step 2c — Implement**');
  });
});
