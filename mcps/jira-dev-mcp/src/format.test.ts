import { describe, expect, it } from 'vitest';
import { formatAttachment, formatIssueDetail, formatIssueList, formatProjectPath } from './format.js';

describe('formatIssueList', () => {
  it('renders markdown list output with warnings', () => {
    const text = formatIssueList('Jira Search Results', 'markdown', {
      query: 'text ~ "login"',
      startAt: 0,
      maxResults: 10,
      total: 1,
      has_more: false,
      next_offset: null,
      issues: [
        {
          key: 'AT-101',
          summary: 'Login page crashes',
          status: 'In Progress',
          assignee: 'Kai Li',
          issueType: 'Bug',
          parentKey: 'AT-100',
        },
      ],
      warnings: ['Plaintext Jira token found in config.json.'],
    });

    expect(text).toContain('# Jira Search Results');
    expect(text).toContain('## AT-101 Login page crashes');
    expect(text).toContain('- Parent: AT-100');
    expect(text).toContain('## Warnings');
  });
});

describe('formatIssueDetail', () => {
  it('renders markdown detail sections', () => {
    const text = formatIssueDetail('markdown', {
      issue: {
        key: 'AT-101',
        summary: 'Login page crashes',
        descriptionPlainText: 'Crash after callback',
        status: 'In Progress',
        assignee: 'Kai Li',
        issueType: 'Bug',
        priority: 'High',
        labels: ['auth'],
        parent: null,
        subtasks: [
          { key: 'AT-111', summary: 'Add retry', status: 'Done', assignee: 'Kai Li', issueType: 'Sub-task', parentKey: 'AT-101' },
        ],
        attachments: [
          { filename: 'error-log.txt', mimeType: 'text/plain', size: 120, created: null, author: null },
        ],
        comments: {
          enabled: true,
          startAt: 0,
          maxResults: 20,
          total: 1,
          items: [{ id: 'c1', author: 'Reviewer', created: '2026-03-30T08:00:00.000Z', updated: null, bodyPlainText: 'Please verify retry logic' }],
        },
        changelog: {
          startAt: 0,
          maxResults: 20,
          total: 1,
          items: [{ id: 'h1', author: 'Kai Li', created: '2026-03-30T06:00:00.000Z', items: [{ field: 'status', from: 'To Do', to: 'In Progress' }] }],
        },
      },
      project: { key: 'AT', localPath: '/tmp/backend', needsUserInput: false },
      nextStepHint: 'Read code under /tmp/backend',
      warnings: ['OAuth token expires soon'],
    });

    expect(text).toContain('# AT-101 Login page crashes');
    expect(text).toContain('## Attachments (1)');
    expect(text).toContain('## Comments (1/1)');
    expect(text).toContain('## Changelog (1/1)');
    expect(text).toContain('## Next Step');
    expect(text).toContain('## Warnings');
  });
});

describe('formatAttachment', () => {
  it('renders parsed attachment metadata and content', () => {
    const text = formatAttachment('markdown', {
      attachment: {
        issueKey: 'AT-101',
        filename: 'report.csv',
        mimeType: 'text/csv',
        size: 512,
        encoding: 'utf8',
        content: 'col1,col2\nval1,val2',
        truncated: false,
        parsed: { format: 'csv', parser: 'python', summary: 'CSV with 2 rows' },
      },
    });

    expect(text).toContain('# Attachment report.csv');
    expect(text).toContain('- Parsed format: csv');
    expect(text).toContain('## Parsed Summary');
    expect(text).toContain('## Content');
  });
});

describe('formatProjectPath', () => {
  it('renders both markdown and json outputs', () => {
    expect(formatProjectPath('markdown', { projectKey: 'AT', localPath: '/tmp/backend' })).toContain('/tmp/backend');
    expect(formatProjectPath('json', { projectKey: 'AT', localPath: null })).toBe(JSON.stringify({ projectKey: 'AT', localPath: null }, null, 2));
  });
});
