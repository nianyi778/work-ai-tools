import type { IssueDetail, ResponseFormat } from './types.js';
import { appendWarnings, jsonText } from './format-common.js';

export function formatIssueDetail(
  responseFormat: ResponseFormat,
  payload: {
    issue: IssueDetail;
    project: { key: string; localPath: string | null; needsUserInput: boolean };
    nextStepHint: string;
    warnings?: string[];
  }
): string {
  if (responseFormat === 'json') {
    return jsonText(payload);
  }

  const { issue, project, nextStepHint } = payload;
  const lines = [
    `# ${issue.key} ${issue.summary}`,
    '',
    `- Status: ${issue.status || 'Unknown'}`,
    `- Assignee: ${issue.assignee || 'Unassigned'}`,
    `- Type: ${issue.issueType || 'Unknown'}`,
    `- Priority: ${issue.priority || 'Unknown'}`,
    `- Project path: ${project.localPath || 'Not configured'}`,
    '',
    '## Description',
    issue.descriptionPlainText || '(empty)',
    '',
    `## Attachments (${issue.attachments.length})`,
  ];

  for (const attachment of issue.attachments) {
    lines.push(`- ${attachment.filename} (${attachment.mimeType}, ${attachment.size} bytes)`);
  }

  lines.push('');
  lines.push(`## Subtasks (${issue.subtasks.length})`);
  for (const subtask of issue.subtasks) {
    lines.push(`- ${subtask.key} ${subtask.summary} [${subtask.status || 'Unknown'}]`);
  }

  if (issue.comments.enabled) {
    lines.push('');
    lines.push(`## Comments (${issue.comments.items.length}/${issue.comments.total})`);
    for (const comment of issue.comments.items) {
      lines.push(`- ${comment.author || 'Unknown'} @ ${comment.created} [id: ${comment.id}]`);
      lines.push(`  ${comment.bodyPlainText || '(empty)'}`);
    }
  }

  lines.push('');
  lines.push(`## Changelog (${issue.changelog.items.length}/${issue.changelog.total})`);
  for (const history of issue.changelog.items) {
    lines.push(`- ${history.author || 'Unknown'} @ ${history.created}`);
    for (const item of history.items) {
      lines.push(`  ${item.field}: ${item.from || 'null'} -> ${item.to || 'null'}`);
    }
  }

  lines.push('');
  lines.push('## Next Step');
  lines.push(nextStepHint);

  appendWarnings(lines, payload.warnings);
  return lines.join('\n');
}
