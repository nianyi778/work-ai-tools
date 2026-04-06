import { z } from 'zod';
import { ensureJiraCredentials, loadResolvedConfig } from '../config.js';
import { formatAttachment } from '../format.js';
import { downloadAttachment, downloadAllAttachments } from '../jira-client.js';
import type { DownloadedAttachment, ResponseFormat } from '../types.js';

export const downloadAttachmentSchema = z.object({
  key: z.string().describe('Jira issue key (e.g. AT-123)'),
  filename: z.string().describe('Attachment filename as listed in jira_read_task'),
  response_format: z.enum(['json', 'markdown']).optional().describe('Output format (default json)'),
});

export const downloadAllAttachmentsSchema = z.object({
  key: z.string().describe('Jira issue key (e.g. AT-123)'),
  mime_filter: z.string().optional().describe('Filter by MIME type prefix (e.g. "image/" for images only, "text/" for text files)'),
  response_format: z.enum(['json', 'markdown']).optional().describe('Output format (default markdown)'),
});

export async function handleDownloadAttachment(args: unknown) {
  const { key: rawKey, filename: rawFilename, response_format } = downloadAttachmentSchema.parse(args);
  const key = rawKey.trim().toUpperCase();
  const filename = rawFilename.trim();
  if (!key || !filename) {
    throw new Error('jira_download_attachment requires key and filename');
  }

  const config = await loadResolvedConfig();
  ensureJiraCredentials(config);
  const attachment = await downloadAttachment(config, { key, filename });

  const payload = {
    attachment,
    warnings: config.warnings,
  };
  return {
    text: formatAttachment(response_format ?? 'json', payload),
    data: payload,
  };
}

function formatAllAttachments(
  responseFormat: ResponseFormat,
  result: { issueKey: string; attachments: DownloadedAttachment[] },
): string {
  if (responseFormat === 'json') {
    return JSON.stringify(result, null, 2);
  }

  if (result.attachments.length === 0) {
    return `No attachments found on ${result.issueKey}.`;
  }

  const lines = [`# Attachments for ${result.issueKey} (${result.attachments.length} files)`, ''];
  for (const a of result.attachments) {
    lines.push(`## ${a.filename}`);
    lines.push(`- MIME: ${a.mimeType} | Size: ${a.size} | Encoding: ${a.encoding}`);
    if (a.content.startsWith('[SKIPPED]')) {
      lines.push(`- ${a.content}`);
    } else {
      lines.push(`- Truncated: ${a.truncated ? 'yes' : 'no'}`);
      if (a.parsed) {
        lines.push(`- Parsed: ${a.parsed.format} (${a.parsed.parser})`);
      }
      lines.push('', '```', a.content.slice(0, 2000), '```');
      if (a.content.length > 2000) {
        lines.push(`... (${a.content.length} chars total, showing first 2000)`);
      }
    }
    lines.push('');
  }
  return lines.join('\n');
}

export async function handleDownloadAllAttachments(args: unknown) {
  const { key: rawKey, mime_filter, response_format } = downloadAllAttachmentsSchema.parse(args);
  const key = rawKey.trim().toUpperCase();
  if (!key) {
    throw new Error('jira_download_all_attachments requires key');
  }

  const config = await loadResolvedConfig();
  ensureJiraCredentials(config);
  const result = await downloadAllAttachments(config, { key, mimeFilter: mime_filter });

  return {
    text: formatAllAttachments(response_format ?? 'markdown', result),
    data: result,
  };
}
