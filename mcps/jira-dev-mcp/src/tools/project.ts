import { z } from 'zod';
import { getProjectPath, setProjectPath } from '../config.js';
import { formatProjectPath } from '../format.js';

export const setProjectPathSchema = z.object({
  jiraProject: z.string().describe('Jira project key (e.g. AT)'),
  localPath: z.string().describe('Absolute local path to the project repository'),
});

export const getProjectPathSchema = z.object({
  jiraProject: z.string().describe('Jira project key (e.g. AT)'),
  response_format: z.enum(['json', 'markdown']).optional().describe('Output format (default json)'),
});

export async function handleSetProjectPath(args: unknown): Promise<{ projectKey: string; localPath: string }> {
  const { jiraProject, localPath } = setProjectPathSchema.parse(args);
  const projectKey = jiraProject.trim();
  const localPathTrimmed = localPath.trim();
  if (!projectKey || !localPathTrimmed) {
    throw new Error('jira_set_project_path requires jiraProject and localPath');
  }
  return setProjectPath(projectKey, localPathTrimmed);
}

export async function handleGetProjectPath(args: unknown): Promise<{ text: string; data: { projectKey: string; localPath: string | null } }> {
  const { jiraProject, response_format } = getProjectPathSchema.parse(args);
  const projectKey = jiraProject.trim().toUpperCase();
  if (!projectKey) {
    throw new Error('jira_get_project_path requires jiraProject');
  }

  const payload = {
    projectKey,
    localPath: await getProjectPath(projectKey),
  };
  return {
    text: formatProjectPath(response_format ?? 'json', payload),
    data: payload,
  };
}
