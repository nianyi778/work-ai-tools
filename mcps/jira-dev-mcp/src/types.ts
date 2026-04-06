export interface OAuthTokens {
  clientId: string;
  clientSecret?: string;  // not persisted after v1.1.3; runtime value from defaults.ts or env var
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  cloudId: string;
  cloudUrl: string;
}

export interface JiraConfigInput {
  baseUrl?: string;
  authMode?: 'basic' | 'bearer' | 'oauth';
  email?: string;
  token?: string;
  apiToken?: string;
  oauth?: OAuthTokens;
}

export interface UserConfig {
  jira?: JiraConfigInput;
  projects?: Record<string, string>;
  preferences?: {
    commentMode?: 'manual' | 'auto';
  };
  security?: {
    maxAttachmentSizeBytes?: number;
    allowedMimeTypes?: string[];
  };
}

export interface ResolvedConfig {
  jira: {
    baseUrl?: string;
    browseUrl?: string;
    authMode: 'basic' | 'bearer';
    email?: string;
    token?: string;
  };
  projects: Record<string, string>;
  preferences: {
    commentMode: 'manual' | 'auto';
  };
  security: {
    maxAttachmentSizeBytes: number;
    allowedMimeTypes: string[];
  };
  warnings: string[];
}

export interface JiraUser {
  accountId?: string;
  displayName: string;
  emailAddress?: string;
}

export interface JiraStatus {
  id?: string;
  name: string;
  statusCategory?: {
    key?: string;
    name?: string;
  };
}

export interface JiraIssueType {
  id?: string;
  name: string;
}

export interface JiraAttachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  content: string;
  thumbnail?: string;
  created?: string;
  author?: JiraUser;
}

export interface JiraIssueRef {
  id?: string;
  key: string;
  fields: {
    summary: string;
    status?: JiraStatus;
    assignee?: JiraUser | null;
  };
}

export interface JiraComment {
  id: string;
  created: string;
  updated?: string;
  author?: JiraUser;
  body?: unknown;
}

export interface JiraCommentPage {
  comments: JiraComment[];
  startAt: number;
  maxResults: number;
  total: number;
}

export interface JiraChangelogItem {
  field: string;
  fieldtype?: string;
  from?: string | null;
  fromString?: string | null;
  to?: string | null;
  toString?: string | null;
}

export interface JiraChangelogHistory {
  id: string;
  author?: JiraUser;
  created: string;
  items: JiraChangelogItem[];
}

export interface JiraChangelog {
  histories: JiraChangelogHistory[];
  startAt?: number;
  maxResults?: number;
  total?: number;
}

export interface JiraIssueLinkType {
  name: string;
  inward: string;
  outward: string;
}

export interface JiraIssueLink {
  id: string;
  type: JiraIssueLinkType;
  inwardIssue?: {
    key: string;
    fields: { summary: string; status?: JiraStatus };
  };
  outwardIssue?: {
    key: string;
    fields: { summary: string; status?: JiraStatus };
  };
}

export interface IssueLinkSummary {
  key: string;
  summary: string;
  status: string | null;
  relation: string;
}

export interface JiraIssueFields {
  summary: string;
  description?: unknown;
  status?: JiraStatus;
  assignee?: JiraUser | null;
  priority?: { name: string };
  issuetype?: JiraIssueType;
  labels?: string[];
  attachment?: JiraAttachment[];
  parent?: {
    key: string;
    fields?: { summary?: string };
  };
  subtasks?: JiraIssueRef[];
  issuelinks?: JiraIssueLink[];
}

export interface JiraIssue {
  id: string;
  key: string;
  fields: JiraIssueFields;
  changelog?: JiraChangelog;
}

export interface JiraSearchResponse {
  issues: JiraIssue[];
  startAt: number;
  maxResults: number;
  total: number;
}

export interface IssueSummary {
  key: string;
  summary: string;
  status: string | null;
  assignee: string | null;
  issueType: string | null;
  parentKey: string | null;
}

export interface IssueAttachmentSummary {
  filename: string;
  mimeType: string;
  size: number;
  created: string | null;
  author: string | null;
}

export interface IssueCommentSummary {
  id: string;
  author: string | null;
  created: string;
  updated: string | null;
  bodyPlainText: string;
}

export interface IssueChangelogSummary {
  id: string;
  author: string | null;
  created: string;
  items: Array<{
    field: string;
    from: string | null;
    to: string | null;
  }>;
}

export interface IssueDetail {
  key: string;
  summary: string;
  descriptionPlainText: string;
  status: string | null;
  assignee: string | null;
  issueType: string | null;
  priority: string | null;
  labels: string[];
  parent: { key: string; summary: string | null } | null;
  subtasks: IssueSummary[];
  linkedIssues: IssueLinkSummary[];
  attachments: IssueAttachmentSummary[];
  comments: {
    enabled: boolean;
    startAt: number;
    maxResults: number;
    total: number;
    items: IssueCommentSummary[];
  };
  changelog: {
    startAt: number;
    maxResults: number;
    total: number;
    items: IssueChangelogSummary[];
  };
}

export interface DownloadedAttachment {
  issueKey: string;
  filename: string;
  mimeType: string;
  size: number;
  encoding: 'utf8' | 'base64';
  content: string;
  truncated: boolean;
  parsed?: {
    format: string;
    parser: 'python';
    summary: string;
  };
}

export type ResponseFormat = 'json' | 'markdown';

export interface SearchIssuesInput {
  query: string;
  maxResults?: number;
  startAt?: number;
}

export interface ReadIssueInput {
  key: string;
  includeComments?: boolean;
  commentStartAt?: number;
  commentMaxResults?: number;
  changelogStartAt?: number;
  changelogMaxResults?: number;
}

export interface DownloadAttachmentInput {
  key: string;
  filename: string;
}

export interface MyTasksInput {
  status?: string;
  maxResults?: number;
  startAt?: number;
}

export interface AddCommentInput {
  key: string;
  body: string;
  confirmToken?: string;
}

export interface EditCommentInput {
  key: string;
  commentId: string;
  body: string;
  confirmToken?: string;
}

export interface AddCommentResult {
  posted: boolean;
  requiresConfirmation: boolean;
  commentId: string;
  url: string;
  preview: {
    key: string;
    commentId?: string;
    body: string;
  };
  mode: 'manual' | 'auto';
  reminder?: string;
  confirmationToken?: string;
}
