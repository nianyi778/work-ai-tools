export interface AdfNode {
  type?: string;
  text?: string;
  content?: AdfNode[];
  attrs?: Record<string, unknown>;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
}

function isAdfNode(node: unknown): node is AdfNode {
  return typeof node === 'object' && node !== null && !Array.isArray(node);
}

function extractText(node: AdfNode): string {
  if (!node.text) return '';
  if (!node.marks?.length) return node.text;

  let text = node.text;
  for (const mark of node.marks) {
    switch (mark.type) {
      case 'code':
        text = `\`${text}\``;
        break;
      case 'strong':
        text = `**${text}**`;
        break;
      case 'em':
        text = `*${text}*`;
        break;
      case 'strike':
        text = `~~${text}~~`;
        break;
      case 'link': {
        const href = mark.attrs?.href;
        if (href) text = `[${text}](${href})`;
        break;
      }
    }
  }
  return text;
}

function childrenToText(node: AdfNode): string {
  if (!Array.isArray(node.content)) return '';
  return node.content.filter(isAdfNode).map(adfNodeToPlainText).join('');
}

function tableToText(node: AdfNode): string {
  if (!Array.isArray(node.content)) return '';
  const rows: string[][] = [];
  let isHeader = false;

  for (const row of node.content) {
    if (!isAdfNode(row) || row.type !== 'tableRow') continue;
    const cells: string[] = [];
    for (const cell of row.content ?? []) {
      if (!isAdfNode(cell)) continue;
      if (cell.type === 'tableHeader') isHeader = true;
      cells.push(childrenToText(cell).replace(/\n/g, ' ').trim());
    }
    rows.push(cells);
  }

  if (rows.length === 0) return '';

  const colCount = Math.max(...rows.map((r) => r.length));
  const colWidths = Array.from({ length: colCount }, (_, i) =>
    Math.max(3, ...rows.map((r) => (r[i] ?? '').length)),
  );

  const lines: string[] = [];
  for (let ri = 0; ri < rows.length; ri++) {
    const cells = rows[ri];
    const padded = Array.from({ length: colCount }, (_, i) =>
      (cells[i] ?? '').padEnd(colWidths[i]),
    );
    lines.push(`| ${padded.join(' | ')} |`);
    if (ri === 0 && isHeader) {
      lines.push(`| ${colWidths.map((w) => '-'.repeat(w)).join(' | ')} |`);
    }
  }
  return lines.join('\n');
}

function listToText(node: AdfNode, ordered: boolean): string {
  if (!Array.isArray(node.content)) return '';
  return node.content
    .filter(isAdfNode)
    .map((item, i) => {
      const prefix = ordered ? `${i + 1}. ` : '- ';
      const text = childrenToText(item).trim();
      return text.split('\n').map((line, li) => (li === 0 ? `${prefix}${line}` : `  ${line}`)).join('\n');
    })
    .join('\n');
}

function adfNodeToPlainText(node: AdfNode): string {
  switch (node.type) {
    case 'text':
      return extractText(node);

    case 'hardBreak':
      return '\n';

    case 'paragraph':
    case 'heading':
      return childrenToText(node);

    case 'blockquote':
      return childrenToText(node)
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n');

    case 'codeBlock': {
      const lang = (node.attrs?.language as string) ?? '';
      const code = childrenToText(node);
      return `\`\`\`${lang}\n${code}\n\`\`\``;
    }

    case 'orderedList':
      return listToText(node, true);

    case 'bulletList':
      return listToText(node, false);

    case 'listItem':
      return childrenToText(node);

    case 'table':
      return tableToText(node);

    case 'rule':
      return '---';

    case 'panel': {
      const panelType = (node.attrs?.panelType as string) ?? 'info';
      const body = childrenToText(node).trim();
      return `[${panelType.toUpperCase()}] ${body}`;
    }

    case 'expand': {
      const title = (node.attrs?.title as string) ?? '';
      const body = childrenToText(node).trim();
      return title ? `▸ ${title}\n${body}` : body;
    }

    case 'mention': {
      const mentionText = (node.attrs?.text as string) ?? '';
      return mentionText || '@unknown';
    }

    case 'emoji':
      return (node.attrs?.shortName as string) ?? (node.attrs?.text as string) ?? '';

    case 'date': {
      const timestamp = node.attrs?.timestamp as string | undefined;
      return timestamp ?? '';
    }

    case 'status': {
      const statusText = (node.attrs?.text as string) ?? '';
      return `[${statusText}]`;
    }

    case 'inlineCard': {
      const url = node.attrs?.url as string | undefined;
      return url ?? '';
    }

    case 'mediaGroup':
    case 'mediaSingle':
      return childrenToText(node);

    case 'media': {
      const alt = (node.attrs?.alt as string) ?? (node.attrs?.id as string) ?? 'media';
      return `[${alt}]`;
    }

    case 'doc':
    default:
      if (!Array.isArray(node.content)) return '';
      return node.content
        .filter(isAdfNode)
        .map(adfNodeToPlainText)
        .filter(Boolean)
        .join('\n');
  }
}

export function adfToPlainText(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  return adfNodeToPlainText(node as AdfNode).trim();
}
