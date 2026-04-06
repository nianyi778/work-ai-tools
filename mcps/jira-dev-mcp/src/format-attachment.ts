import type { DownloadedAttachment, ResponseFormat } from './types.js';
import { jsonText } from './format-common.js';

export function formatAttachment(
  responseFormat: ResponseFormat,
  payload: { attachment: DownloadedAttachment; warnings?: string[] }
): string {
  if (responseFormat === 'json') {
    return jsonText(payload);
  }

  const { attachment } = payload;
  const lines = [
    `# Attachment ${attachment.filename}`,
    '',
    `- Issue: ${attachment.issueKey}`,
    `- MIME type: ${attachment.mimeType}`,
    `- Size: ${attachment.size}`,
    `- Encoding: ${attachment.encoding}`,
  ];

  lines.push(`- Truncated: ${attachment.truncated ? 'yes' : 'no'}`);

  if (attachment.parsed) {
    lines.push(`- Parsed format: ${attachment.parsed.format}`);
    lines.push(`- Parser: ${attachment.parsed.parser}`);
    lines.push('');
    lines.push('## Parsed Summary');
    lines.push(attachment.parsed.summary);
  }

  lines.push('');
  lines.push('## Content');
  lines.push(attachment.content);

  return lines.join('\n');
}
