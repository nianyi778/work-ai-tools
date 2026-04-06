import { z } from 'zod';
import { ensureJiraCredentials, loadResolvedConfig } from '../config.js';
import { formatIssueList } from '../format.js';
import { searchIssues } from '../jira-client.js';
import { JiraValidationError } from '../errors.js';

export const searchIssuesSchema = z.object({
  query: z.string().describe('Search query (keywords or JQL)'),
  maxResults: z.number().int().min(1).max(50).optional().describe('Max results to return (1-50, default 10)'),
  startAt: z.number().int().min(0).optional().describe('Pagination offset (default 0)'),
  response_format: z.enum(['json', 'markdown']).optional().describe('Output format (default json)'),
});

export async function handleJiraSearch(args: unknown) {
  const { query, maxResults, startAt, response_format } = searchIssuesSchema.parse(args);
  if (!query.trim()) {
    throw new JiraValidationError('jira_search_issues requires query');
  }

  const config = await loadResolvedConfig();
  ensureJiraCredentials(config);
  const result = await searchIssues(config, { query, maxResults, startAt });
  const nextOffset = result.startAt + result.issues.length;
  const payload = {
    ...result,
    has_more: result.issues.length > 0 && nextOffset < result.total,
    next_offset: result.issues.length > 0 && nextOffset < result.total ? nextOffset : null,
    warnings: config.warnings,
  };
  return {
    text: formatIssueList('Jira Search Results', response_format ?? 'json', payload),
    data: payload,
  };
}
