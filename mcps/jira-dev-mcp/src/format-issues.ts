import type { IssueSummary, ResponseFormat } from './types.js';
import { appendWarnings, jsonText } from './format-common.js';

export function formatIssueList(
  title: string,
  responseFormat: ResponseFormat,
  payload: { query: string; startAt: number; maxResults: number; total: number; has_more: boolean; next_offset: number | null; issues: IssueSummary[]; warnings?: string[] }
): string {
  if (responseFormat === 'json') {
    return jsonText(payload);
  }

  const lines = [
    `# ${title}`,
    '',
    `- Query: ${payload.query}`,
    `- Total: ${payload.total}`,
    `- Offset: ${payload.startAt}`,
    `- Limit: ${payload.maxResults}`,
    `- Has more: ${payload.has_more ? 'yes' : 'no'}`,
    '',
  ];

  for (const issue of payload.issues) {
    lines.push(`## ${issue.key} ${issue.summary}`);
    lines.push(`- Status: ${issue.status || 'Unknown'}`);
    lines.push(`- Assignee: ${issue.assignee || 'Unassigned'}`);
    lines.push(`- Type: ${issue.issueType || 'Unknown'}`);
    if (issue.parentKey) {
      lines.push(`- Parent: ${issue.parentKey}`);
    }
    lines.push('');
  }

  appendWarnings(lines, payload.warnings);
  return lines.join('\n');
}
