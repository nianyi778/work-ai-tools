import { describe, expect, it } from 'vitest';
import { adfToPlainText } from './jira-adf.js';

describe('adfToPlainText', () => {
  it('parses plain text node', () => {
    expect(adfToPlainText({ type: 'text', text: 'hello' })).toBe('hello');
  });

  it('parses paragraph with inline marks', () => {
    const input = {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'bold', marks: [{ type: 'strong' }] },
        { type: 'text', text: ' ' },
        { type: 'text', text: 'italic', marks: [{ type: 'em' }] },
        { type: 'text', text: ' ' },
        { type: 'text', text: 'code', marks: [{ type: 'code' }] },
        { type: 'text', text: ' ' },
        { type: 'text', text: 'link', marks: [{ type: 'link', attrs: { href: 'https://example.com' } }] },
        { type: 'text', text: ' ' },
        { type: 'text', text: 'strike', marks: [{ type: 'strike' }] },
      ],
    };

    expect(adfToPlainText(input)).toBe('**bold** *italic* `code` [link](https://example.com) ~~strike~~');
  });

  it('parses heading', () => {
    expect(adfToPlainText({ type: 'heading', content: [{ type: 'text', text: 'Section Title' }] })).toBe('Section Title');
  });

  it('parses code block without language', () => {
    const input = { type: 'codeBlock', content: [{ type: 'text', text: 'console.log(1);' }] };
    expect(adfToPlainText(input)).toBe('```\nconsole.log(1);\n```');
  });

  it('parses code block with language', () => {
    const input = { type: 'codeBlock', attrs: { language: 'ts' }, content: [{ type: 'text', text: 'const n = 1;' }] };
    expect(adfToPlainText(input)).toBe('```ts\nconst n = 1;\n```');
  });

  it('parses ordered list and bullet list', () => {
    const ordered = {
      type: 'orderedList',
      content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'first' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'second' }] }] },
      ],
    };
    const bullet = {
      type: 'bulletList',
      content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'b' }] }] },
      ],
    };

    expect(adfToPlainText(ordered)).toBe('1. first\n2. second');
    expect(adfToPlainText(bullet)).toBe('- a\n- b');
  });

  it('parses table with headers', () => {
    const input = {
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [
            { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Name' }] }] },
            { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Age' }] }] },
          ],
        },
        {
          type: 'tableRow',
          content: [
            { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Alice' }] }] },
            { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '30' }] }] },
          ],
        },
      ],
    };

    expect(adfToPlainText(input)).toBe('| Name  | Age |\n| ----- | --- |\n| Alice | 30  |');
  });

  it('parses table without headers', () => {
    const input = {
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [
            { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A' }] }] },
            { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'B' }] }] },
          ],
        },
      ],
    };

    expect(adfToPlainText(input)).toBe('| A   | B   |');
  });

  it('parses blockquote', () => {
    const input = { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'quoted' }] }] };
    expect(adfToPlainText(input)).toBe('> quoted');
  });

  it('parses mention/emoji/date/status/inlineCard nodes', () => {
    const input = {
      type: 'paragraph',
      content: [
        { type: 'mention', attrs: { text: '@kai' } },
        { type: 'text', text: ' ' },
        { type: 'emoji', attrs: { shortName: ':rocket:' } },
        { type: 'text', text: ' ' },
        { type: 'date', attrs: { timestamp: '1710000000000' } },
        { type: 'text', text: ' ' },
        { type: 'status', attrs: { text: 'Done' } },
        { type: 'text', text: ' ' },
        { type: 'inlineCard', attrs: { url: 'https://example.com/doc' } },
      ],
    };

    expect(adfToPlainText(input)).toBe('@kai :rocket: 1710000000000 [Done] https://example.com/doc');
  });

  it('parses panel and expand nodes', () => {
    const panel = {
      type: 'panel',
      attrs: { panelType: 'warning' },
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Check this first' }] }],
    };
    const expand = {
      type: 'expand',
      attrs: { title: 'Details' },
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hidden body' }] }],
    };

    expect(adfToPlainText(panel)).toBe('[WARNING] Check this first');
    expect(adfToPlainText(expand)).toBe('▸ Details\nHidden body');
  });

  it('parses media/mediaSingle/mediaGroup', () => {
    const input = {
      type: 'doc',
      content: [
        {
          type: 'mediaSingle',
          content: [{ type: 'media', attrs: { alt: 'Screenshot 1' } }],
        },
        {
          type: 'mediaGroup',
          content: [{ type: 'media', attrs: { id: 'file-2' } }, { type: 'media' }],
        },
      ],
    };

    expect(adfToPlainText(input)).toBe('[Screenshot 1]\n[file-2][media]');
  });

  it('parses nested mixed doc structures', () => {
    const input = {
      type: 'doc',
      content: [
        { type: 'heading', content: [{ type: 'text', text: 'Title' }] },
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'item' }] }] },
          ],
        },
        {
          type: 'codeBlock',
          attrs: { language: 'js' },
          content: [{ type: 'text', text: 'console.log(2);' }],
        },
      ],
    };

    expect(adfToPlainText(input)).toBe('Title\n- item\n```js\nconsole.log(2);\n```');
  });

  it('returns empty string for empty/null/undefined input', () => {
    expect(adfToPlainText({})).toBe('');
    expect(adfToPlainText(null)).toBe('');
    expect(adfToPlainText(undefined)).toBe('');
  });
});
