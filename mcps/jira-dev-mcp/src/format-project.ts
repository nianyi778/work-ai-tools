import type { ResponseFormat } from './types.js';
import { jsonText } from './format-common.js';

export function formatProjectPath(
  responseFormat: ResponseFormat,
  payload: { projectKey: string; localPath: string | null }
): string {
  if (responseFormat === 'json') {
    return jsonText(payload);
  }

  return payload.localPath
    ? `Project ${payload.projectKey} is mapped to ${payload.localPath}`
    : `Project ${payload.projectKey} has no configured local path.`;
}
