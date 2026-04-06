import type { IssueSummary, JiraIssue, JiraSearchResponse, MyTasksInput, ResolvedConfig, SearchIssuesInput } from './types.js';
import { jiraRequest } from './jira-http.js';

export function buildSearchJql(query: string): string {
  const trimmed = query.trim();
  const looksLikeJql = /\border\s+by\b/i.test(trimmed)
    || /\b(?:project|assignee|status|type|issuetype|key|text|labels|priority|reporter|created|updated|resolution)\b\s*(?:=|!=|~|!~|>=|<=|>|<|\bin\b|\bnot\s+in\b|\bis\b)/i.test(trimmed)
    || /\bcurrentUser\(\)/i.test(trimmed);
  if (looksLikeJql) { return trimmed; }
  const escaped = trimmed.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `text ~ "${escaped}" ORDER BY updated DESC`;
}

function mapIssueSummary(issue: JiraIssue): IssueSummary {
  return {
    key: issue.key,
    summary: issue.fields.summary,
    status: issue.fields.status?.name || null,
    assignee: issue.fields.assignee?.displayName || null,
    issueType: issue.fields.issuetype?.name || null,
    parentKey: issue.fields.parent?.key || null,
  };
}

export async function searchIssues(config: ResolvedConfig, input: SearchIssuesInput): Promise<{ query: string; startAt: number; maxResults: number; total: number; issues: IssueSummary[] }> {
  const maxResults = Math.min(Math.max(input.maxResults || 10, 1), 50);
  const startAt = Math.max(input.startAt || 0, 0);
  const jql = buildSearchJql(input.query);
  const params = new URLSearchParams({
    jql, startAt: String(startAt), maxResults: String(maxResults),
    fields: 'summary,status,assignee,issuetype,parent',
  });
  const data = await jiraRequest<JiraSearchResponse>(config, `/rest/api/3/search?${params.toString()}`);
  return { query: jql, startAt: data.startAt, maxResults: data.maxResults, total: data.total, issues: data.issues.map(mapIssueSummary) };
}

export async function getMyTasks(config: ResolvedConfig, input: MyTasksInput): Promise<{ query: string; startAt: number; maxResults: number; total: number; issues: IssueSummary[] }> {
  const clauses = ['assignee = currentUser()'];
  if (input.status) { clauses.push(`status = "${input.status.replace(/"/g, '\\"')}"`); }
  return searchIssues(config, { query: `${clauses.join(' AND ')} ORDER BY updated DESC`, maxResults: input.maxResults, startAt: input.startAt });
}
