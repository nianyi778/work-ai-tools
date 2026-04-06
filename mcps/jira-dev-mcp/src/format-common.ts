export function jsonText(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

export function appendWarnings(lines: string[], warnings?: string[]): void {
  if (!warnings?.length) {
    return;
  }

  lines.push('');
  lines.push('## Warnings');
  for (const warning of warnings) {
    lines.push(`- ${warning}`);
  }
}
