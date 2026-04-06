import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { ServerNotification, ServerRequest } from '@modelcontextprotocol/sdk/types.js';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { realpathSync, readFileSync } from 'node:fs';
import { handleJiraSearch, searchIssuesSchema } from './tools/search.js';
import { handleReadTask, readTaskSchema } from './tools/read-task.js';
import { handleDownloadAttachment, downloadAttachmentSchema, handleDownloadAllAttachments, downloadAllAttachmentsSchema } from './tools/attachment.js';
import { handleMyTasks, myTasksSchema } from './tools/my-tasks.js';
import { handleSetProjectPath, handleGetProjectPath, setProjectPathSchema, getProjectPathSchema } from './tools/project.js';
import { handleAddComment, handleEditComment, addCommentSchemaShape, editCommentSchemaShape } from './tools/comment.js';
import { handleAnalyzeTask, analyzeTaskSchema } from './tools/analyze-task.js';

let _pkgVersion = '0.0.0';
try {
  _pkgVersion = (JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../package.json'), 'utf8')) as { version: string }).version;
} catch { /* fallback: version unknown */ }

function textContent(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}

function formatCommentPreview(actionLabel: string, result: Awaited<ReturnType<typeof handleAddComment>>) {
  const lines = [
    `${actionLabel} preview:`,
    '',
    `Issue: ${result.preview.key}`,
  ];
  if (result.preview.commentId) {
    lines.push(`Comment ID: ${result.preview.commentId}`);
  }
  lines.push('Body:');
  lines.push(result.preview.body);
  lines.push('');
  lines.push(`Confirmation token: ${result.confirmationToken}`);
  lines.push('Reply with confirm_token=<token> to send this change.');
  if (result.reminder) {
    lines.push('', result.reminder);
  }
  return textContent(lines.join('\n'));
}

const TOOL_DEFINITIONS = [
  {
    name: 'jira_search_issues',
    description: 'Search Jira issues using natural language keywords or raw JQL. Returns issue keys, summaries, statuses, and assignees.',
    inputSchema: searchIssuesSchema.shape,
    handler: async (args: unknown) => {
      const result = await handleJiraSearch(args);
      return textContent(result.text);
    },
  },
  {
    name: 'jira_read_task',
    description: 'Read raw details of a Jira issue (description, subtasks, changelog, labels, priority, parent, attachments). Data-only — does NOT guide analysis or post comments. Use jira_analyze_task when you need the full investigation workflow.',
    inputSchema: readTaskSchema.shape,
    handler: async (args: unknown) => {
      const result = await handleReadTask(args);
      return textContent(result.text);
    },
  },
  {
    name: 'jira_download_attachment',
    description: 'Download an attachment from a Jira issue. Text files (txt, md, json, log) are returned inline. CSV, XLS, XLSX, PDF are parsed by Python and returned as structured text. Images and other binary files are returned as base64.',
    inputSchema: downloadAttachmentSchema.shape,
    handler: async (args: unknown) => {
      const result = await handleDownloadAttachment(args);
      return textContent(result.text);
    },
  },
  {
    name: 'jira_download_all_attachments',
    description: 'Download all attachments from a Jira issue in a single call. Optionally filter by MIME type (e.g. "image/" for images only). Returns all files with their content inline. Use this instead of multiple jira_download_attachment calls.',
    inputSchema: downloadAllAttachmentsSchema.shape,
    handler: async (args: unknown) => {
      const result = await handleDownloadAllAttachments(args);
      return textContent(result.text);
    },
  },
  {
    name: 'jira_my_tasks',
    description: 'List Jira issues assigned to the currently authenticated user, optionally filtered by status.',
    inputSchema: myTasksSchema.shape,
    handler: async (args: unknown) => {
      const result = await handleMyTasks(args);
      return textContent(result.text);
    },
  },
  {
    name: 'jira_set_project_path',
    description: 'Map a Jira project key to a local repository path. This enables jira_read_task to include the local path hint for code exploration.',
    inputSchema: setProjectPathSchema.shape,
    handler: async (args: unknown) => {
      const result = await handleSetProjectPath(args);
      return textContent(JSON.stringify(result, null, 2));
    },
  },
  {
    name: 'jira_get_project_path',
    description: 'Get the local repository path mapped to a Jira project key.',
    inputSchema: getProjectPathSchema.shape,
    handler: async (args: unknown) => {
      const result = await handleGetProjectPath(args);
      return textContent(result.text);
    },
  },
  {
    name: 'jira_add_comment',
    description: 'Post a comment on a Jira issue. Returns the comment URL so you can verify it directly.',
    inputSchema: addCommentSchemaShape,
    handler: async (args: unknown, extra: RequestHandlerExtra<ServerRequest, ServerNotification>) => {
      const result = await handleAddComment(args, extra);
      if (!result.posted) {
        return formatCommentPreview('Comment', result);
      }
      return textContent(`Comment posted successfully.\n\nView comment: ${result.url}\n\nTo edit it later, use jira_edit_comment with commentId=${result.commentId}.`);
    },
  },
  {
    name: 'jira_edit_comment',
    description: 'Edit an existing Jira comment. In manual mode, returns a preview first and requires confirm_token to apply the update.',
    inputSchema: editCommentSchemaShape,
    handler: async (args: unknown, extra: RequestHandlerExtra<ServerRequest, ServerNotification>) => {
      const result = await handleEditComment(args, extra);
      if (!result.posted) {
        return formatCommentPreview('Comment edit', result);
      }
      return textContent(`Comment updated successfully.\n\nView comment: ${result.url}`);
    },
  },
  {
    name: 'jira_analyze_task',
    description: 'Full investigation and fix workflow for a Jira issue. Accepts an issue key (AT-123) or full browse URL. Reads the issue, prior comments, linked issues, and attachments; detects duplicate analysis (idempotency); selects a type-aware template (Bug/Story/Task); and provides step-by-step SOP: explore code → plan → baseline test → implement → build verify → post analysis comment. Use this instead of jira_read_task when you want to drive the full workflow end-to-end.',
    inputSchema: analyzeTaskSchema.shape,
    handler: async (args: unknown) => {
      const result = await handleAnalyzeTask(args);
      return textContent(result.text);
    },
  },
] as const;

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'jira-dev-mcp',
    version: _pkgVersion,
  });

  for (const tool of TOOL_DEFINITIONS) {
    server.registerTool(tool.name, {
      description: tool.description,
      inputSchema: tool.inputSchema,
    }, tool.handler);
  }

  return server;
}

export async function main() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === fileURLToPath(import.meta.url)) {
  main().catch((err: unknown) => {
    process.stderr.write(`MCP server error: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
