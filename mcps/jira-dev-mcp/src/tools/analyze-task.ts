import { z } from 'zod';
import { ensureJiraCredentials, getProjectPath, inferProjectKey, loadResolvedConfig } from '../config.js';
import { readIssue } from '../jira-client.js';
import { JiraValidationError } from '../errors.js';
import { formatAnalysisWorkflow } from '../format-analysis.js';

export const analyzeTaskSchema = z.object({
  input: z.string().describe('Jira issue key (e.g. AT-123) or full browse URL (e.g. https://xxx.atlassian.net/browse/AT-123)'),
  auto_comment: z.boolean().optional().describe('Automatically post the completed analysis as a comment without asking for confirmation (default false, consistent with commentMode default of manual)'),
  comment_max_results: z.number().int().min(1).max(100).optional().describe('Max comments to fetch for prior-analysis check (1-100, default 50)'),
  response_format: z.enum(['json', 'markdown']).optional().describe('Output format (default markdown)'),
});

export function parseIssueKey(input: string): string {
  const trimmed = input.trim();

  // Full Atlassian browse URL: https://xxx.atlassian.net/browse/AT-123
  const urlMatch = trimmed.match(/\/browse\/([A-Z][A-Z0-9]+-\d+)/i);
  if (urlMatch) {
    return urlMatch[1].toUpperCase();
  }

  // Plain key: AT-123
  const keyMatch = trimmed.match(/^([A-Z][A-Z0-9]+-\d+)$/i);
  if (keyMatch) {
    return keyMatch[1].toUpperCase();
  }

  throw new JiraValidationError(
    `Cannot parse issue key from: "${input}". Accepted formats: "AT-123" or "https://xxx.atlassian.net/browse/AT-123"`
  );
}

export async function handleAnalyzeTask(args: unknown) {
  const { input: rawInput, auto_comment: autoCommentRaw, comment_max_results, response_format } = analyzeTaskSchema.parse(args);
  const trimmedInput = rawInput.trim();
  if (!trimmedInput) {
    throw new JiraValidationError('jira_analyze_task requires input (issue key or URL)');
  }
  // Default false: consistent with commentMode default of 'manual'.
  // Pass auto_comment=true only when the caller explicitly wants unattended posting.
  const autoComment = autoCommentRaw === true;
  const responseFormat = response_format ?? 'markdown';

  const key = parseIssueKey(trimmedInput);
  const projectKey = inferProjectKey(key);

  const config = await loadResolvedConfig();
  ensureJiraCredentials(config);

  const issue = await readIssue(config, {
    key,
    includeComments: true,
    commentMaxResults: comment_max_results ?? 50,
    changelogMaxResults: 5,
  });

  const localPath = await getProjectPath(projectKey);

  // Detect an existing analysis comment: 【KEY】 must appear at the start of a line,
  // followed immediately by a non-whitespace character (language-agnostic header).
  // Using ^ with multiline flag avoids false-positives on normal inline references like
  // "参考【AT-303】の方針で進めます" where the marker appears mid-sentence.
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const analysisPattern = new RegExp(`^【${escapedKey}】\\S`, 'm');
  const existingComment = issue.comments.items.find(
    (c) => analysisPattern.test(c.bodyPlainText)
  ) ?? null;

  const payload = {
    issue,
    project: { key: projectKey, localPath, needsUserInput: !localPath },
    autoComment,
    existingAnalysisCommentId: existingComment ? existingComment.id : null,
    warnings: config.warnings,
  };

  return {
    text: formatAnalysisWorkflow(responseFormat, payload),
    data: payload,
  };
}
