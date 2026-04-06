import type {
  IssueAttachmentSummary,
  IssueChangelogSummary,
  IssueCommentSummary,
  IssueDetail,
  IssueLinkSummary,
  JiraAttachment,
  JiraCommentPage,
  JiraIssue,
  JiraIssueLink,
  ReadIssueInput,
  ResolvedConfig,
} from './types.js';
import { jiraRequest } from './jira-http.js';
import { adfToPlainText } from './jira-adf.js';

const DEFAULT_FIELDS = [
  'summary', 'description', 'status', 'assignee', 'issuetype',
  'priority', 'labels', 'attachment', 'parent', 'subtasks', 'issuelinks',
].join(',');

function mapLinkedIssues(links: JiraIssueLink[] | undefined): IssueLinkSummary[] {
  if (!links?.length) return [];
  return links.flatMap((link) => {
    const results: IssueLinkSummary[] = [];
    if (link.inwardIssue) {
      results.push({
        key: link.inwardIssue.key,
        summary: link.inwardIssue.fields.summary,
        status: link.inwardIssue.fields.status?.name || null,
        relation: link.type.inward,
      });
    }
    if (link.outwardIssue) {
      results.push({
        key: link.outwardIssue.key,
        summary: link.outwardIssue.fields.summary,
        status: link.outwardIssue.fields.status?.name || null,
        relation: link.type.outward,
      });
    }
    return results;
  });
}

function mapAttachmentSummary(attachment: JiraAttachment): IssueAttachmentSummary {
  return {
    filename: attachment.filename,
    mimeType: attachment.mimeType,
    size: attachment.size,
    created: attachment.created || null,
    author: attachment.author?.displayName || null,
  };
}

function mapCommentSummary(comment: JiraCommentPage['comments'][number]): IssueCommentSummary {
  return {
    id: comment.id,
    author: comment.author?.displayName || null,
    created: comment.created,
    updated: comment.updated || null,
    bodyPlainText: adfToPlainText(comment.body),
  };
}

function paginateChangelog(issue: JiraIssue, startAt: number, maxResults: number): { total: number; items: IssueChangelogSummary[] } {
  const histories = issue.changelog?.histories || [];
  const slice = histories.slice(startAt, startAt + maxResults);
  return {
    total: histories.length,
    items: slice.map((history) => ({
      id: history.id,
      author: history.author?.displayName || null,
      created: history.created,
      items: history.items.map((item) => ({
        field: item.field,
        from: item.fromString || item.from || null,
        to: item.toString || item.to || null,
      })),
    })),
  };
}

export async function getIssue(config: ResolvedConfig, key: string, options?: { expandChangelog?: boolean }): Promise<JiraIssue> {
  const params = new URLSearchParams({ fields: DEFAULT_FIELDS });
  if (options?.expandChangelog !== false) {
    params.set('expand', 'changelog');
  }
  return jiraRequest<JiraIssue>(config, `/rest/api/3/issue/${encodeURIComponent(key)}?${params.toString()}`);
}

async function getComments(config: ResolvedConfig, key: string, startAt: number, maxResults: number): Promise<JiraCommentPage> {
  const params = new URLSearchParams({ startAt: String(startAt), maxResults: String(maxResults), orderBy: '-created' });
  return jiraRequest<JiraCommentPage>(config, `/rest/api/3/issue/${encodeURIComponent(key)}/comment?${params.toString()}`);
}

export async function readIssue(config: ResolvedConfig, input: ReadIssueInput): Promise<IssueDetail> {
  const commentStartAt = Math.max(input.commentStartAt || 0, 0);
  const commentMaxResults = Math.min(Math.max(input.commentMaxResults || 20, 1), 50);
  const changelogStartAt = Math.max(input.changelogStartAt || 0, 0);
  const changelogMaxResults = Math.min(Math.max(input.changelogMaxResults || 20, 1), 100);
  const issue = await getIssue(config, input.key);
  const commentPage = input.includeComments ? await getComments(config, input.key, commentStartAt, commentMaxResults) : null;
  const changelog = paginateChangelog(issue, changelogStartAt, changelogMaxResults);

  return {
    key: issue.key,
    summary: issue.fields.summary,
    descriptionPlainText: adfToPlainText(issue.fields.description),
    status: issue.fields.status?.name || null,
    assignee: issue.fields.assignee?.displayName || null,
    issueType: issue.fields.issuetype?.name || null,
    priority: issue.fields.priority?.name || null,
    labels: issue.fields.labels || [],
    parent: issue.fields.parent ? { key: issue.fields.parent.key, summary: issue.fields.parent.fields?.summary || null } : null,
    subtasks: (issue.fields.subtasks || []).map((subtask) => ({
      key: subtask.key, summary: subtask.fields.summary,
      status: subtask.fields.status?.name || null,
      assignee: subtask.fields.assignee?.displayName || null,
      issueType: 'Sub-task', parentKey: issue.key,
    })),
    linkedIssues: mapLinkedIssues(issue.fields.issuelinks),
    attachments: (issue.fields.attachment || []).map(mapAttachmentSummary),
    comments: {
      enabled: Boolean(input.includeComments),
      startAt: commentPage?.startAt || 0, maxResults: commentPage?.maxResults || 0,
      total: commentPage?.total || 0, items: (commentPage?.comments || []).map(mapCommentSummary),
    },
    changelog: { startAt: changelogStartAt, maxResults: changelogMaxResults, total: changelog.total, items: changelog.items },
  };
}
