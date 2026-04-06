import { z } from 'zod';
import { ensureJiraCredentials, getProjectPath, inferProjectKey, loadResolvedConfig } from '../config.js';
import { formatIssueDetail } from '../format.js';
import { readIssue } from '../jira-client.js';
import { JiraValidationError } from '../errors.js';
import { parseIssueKey } from './analyze-task.js';

export const readTaskSchema = z.object({
  input: z.string().describe('Jira issue key or full browse URL (e.g. AT-123 or https://xxx.atlassian.net/browse/AT-123)'),
  includeComments: z.boolean().optional().describe('Include comments (default false)'),
  commentStartAt: z.number().int().min(0).optional().describe('Comment pagination offset'),
  commentMaxResults: z.number().int().min(1).max(50).optional().describe('Max comments (1-50, default 20)'),
  changelogStartAt: z.number().int().min(0).optional().describe('Changelog pagination offset'),
  changelogMaxResults: z.number().int().min(1).max(100).optional().describe('Max changelog entries (1-100, default 20)'),
  response_format: z.enum(['json', 'markdown']).optional().describe('Output format (default json)'),
});

export async function handleReadTask(args: unknown) {
  const { input, includeComments, commentStartAt, commentMaxResults, changelogStartAt, changelogMaxResults, response_format } = readTaskSchema.parse(args);
  const trimmed = input.trim();
  if (!trimmed) {
    throw new JiraValidationError('jira_read_task requires input');
  }
  const key = parseIssueKey(trimmed);

  const config = await loadResolvedConfig();
  ensureJiraCredentials(config);

  const issue = await readIssue(config, {
    key,
    includeComments,
    commentStartAt,
    commentMaxResults,
    changelogStartAt,
    changelogMaxResults,
  });
  const projectKey = inferProjectKey(key);
  const localPath = await getProjectPath(projectKey);

  const payload = {
    issue,
    project: {
      key: projectKey,
      localPath,
      needsUserInput: !localPath,
    },
    nextStepHint: localPath
      ? `Read code under ${localPath} and explain root cause, plan, impact, and test cases.`
      : `Project path for ${projectKey} is missing. Ask the user to provide it with jira_set_project_path.`,
    warnings: config.warnings,
  };
  return {
    text: formatIssueDetail(response_format ?? 'json', payload),
    data: payload,
  };
}
