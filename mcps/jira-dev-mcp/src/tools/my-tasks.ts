import { z } from 'zod';
import { ensureJiraCredentials, loadResolvedConfig } from '../config.js';
import { formatIssueList } from '../format.js';
import { getMyTasks } from '../jira-client.js';

export const myTasksSchema = z.object({
  status: z.string().optional().describe('Filter by status name (e.g. "In Progress", "To Do")'),
  maxResults: z.number().int().min(1).max(50).optional().describe('Max results (1-50, default 10)'),
  startAt: z.number().int().min(0).optional().describe('Pagination offset (default 0)'),
  response_format: z.enum(['json', 'markdown']).optional().describe('Output format (default json)'),
});

export async function handleMyTasks(args: unknown) {
  const { status, maxResults, startAt, response_format } = myTasksSchema.parse(args);

  const config = await loadResolvedConfig();
  ensureJiraCredentials(config);
  const result = await getMyTasks(config, { status, maxResults, startAt });

  const nextOffset = result.startAt + result.issues.length;
  const payload = {
    ...result,
    has_more: result.issues.length > 0 && nextOffset < result.total,
    next_offset: result.issues.length > 0 && nextOffset < result.total ? nextOffset : null,
    warnings: config.warnings,
  };
  return {
    text: formatIssueList('My Jira Tasks', response_format ?? 'json', payload),
    data: payload,
  };
}
