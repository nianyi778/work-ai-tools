import type { DownloadAttachmentInput, DownloadedAttachment, JiraAttachment, JiraIssue, ResolvedConfig } from './types.js';
import { buildAuthHeader, fetchWithRetry, isTextMimeType, matchesMimeType } from './jira-http.js';
import { JiraValidationError } from './errors.js';
import {
  parseAttachmentWithPython,
  truncateText,
  MAX_INLINE_ATTACHMENT_BYTES,
  PARSEABLE_ATTACHMENT_MIME_TYPES,
} from './jira-attachment.js';
import { getIssue } from './jira-issue-read.js';

async function withConcurrencyLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;
  async function worker(): Promise<void> {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function downloadSingleAttachment(
  config: ResolvedConfig,
  issue: JiraIssue,
  attachment: JiraAttachment,
): Promise<DownloadedAttachment> {
  if (attachment.size > config.security.maxAttachmentSizeBytes) {
    return { issueKey: issue.key, filename: attachment.filename, mimeType: attachment.mimeType, size: attachment.size, encoding: 'utf8', content: `[SKIPPED] Exceeds max size limit of ${config.security.maxAttachmentSizeBytes} bytes`, truncated: true };
  }
  if (!matchesMimeType(attachment.mimeType, config.security.allowedMimeTypes)) {
    return { issueKey: issue.key, filename: attachment.filename, mimeType: attachment.mimeType, size: attachment.size, encoding: 'utf8', content: `[SKIPPED] MIME type not allowed: ${attachment.mimeType}`, truncated: true };
  }

  const response = await fetchWithRetry(attachment.content, {
    headers: { Authorization: buildAuthHeader(config), Accept: '*/*' },
  }, {
    timeoutMs: 30_000,
    requestLabel: 'Attachment download',
  });

  const buffer = Buffer.from(await response.arrayBuffer());

  if (PARSEABLE_ATTACHMENT_MIME_TYPES.has(attachment.mimeType)) {
    const parsed = await parseAttachmentWithPython(attachment.filename, buffer);
    if (parsed) {
      return { issueKey: issue.key, filename: attachment.filename, mimeType: attachment.mimeType, size: attachment.size, encoding: 'utf8', content: parsed.content, truncated: parsed.truncated, parsed: parsed.parsed };
    }
  }

  if (isTextMimeType(attachment.mimeType)) {
    const truncated = truncateText(buffer.toString('utf8'), MAX_INLINE_ATTACHMENT_BYTES);
    return { issueKey: issue.key, filename: attachment.filename, mimeType: attachment.mimeType, size: attachment.size, encoding: 'utf8', content: truncated.content, truncated: truncated.truncated };
  }

  const base64Content = buffer.toString('base64');
  const maxBase64Length = Math.floor((MAX_INLINE_ATTACHMENT_BYTES * 4) / 3);
  const truncated = base64Content.length > maxBase64Length;
  return { issueKey: issue.key, filename: attachment.filename, mimeType: attachment.mimeType, size: attachment.size, encoding: 'base64', content: truncated ? `${base64Content.slice(0, maxBase64Length)}... (truncated)` : base64Content, truncated };
}

export async function downloadAttachment(config: ResolvedConfig, input: DownloadAttachmentInput): Promise<DownloadedAttachment> {
  const issue = await getIssue(config, input.key, { expandChangelog: false });
  const attachment = (issue.fields.attachment || []).find((item) => item.filename === input.filename);
  if (!attachment) { throw new JiraValidationError(`Attachment not found on ${input.key}: ${input.filename}`); }
  return downloadSingleAttachment(config, issue, attachment);
}

export async function downloadAllAttachments(
  config: ResolvedConfig,
  input: { key: string; mimeFilter?: string },
): Promise<{ issueKey: string; attachments: DownloadedAttachment[] }> {
  const issue = await getIssue(config, input.key, { expandChangelog: false });
  const allAttachments = issue.fields.attachment || [];

  if (allAttachments.length === 0) {
    return { issueKey: issue.key, attachments: [] };
  }

  let filtered = allAttachments;
  if (input.mimeFilter) {
    const pattern = input.mimeFilter.toLowerCase();
    filtered = allAttachments.filter((a) => a.mimeType.toLowerCase().startsWith(pattern));
  }

  const results = await withConcurrencyLimit(filtered, 5, (a) => downloadSingleAttachment(config, issue, a));

  return { issueKey: issue.key, attachments: results };
}
