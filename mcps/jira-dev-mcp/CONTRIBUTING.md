# Contributing to jira-dev-mcp

## Setup

```bash
npm install
npm test          # run all tests
npx tsc --noEmit  # type check
```

## Project structure

```
src/
  index.ts          # MCP server entry, tool registration
  config.ts         # config loading, OAuth token refresh
  jira-client.ts    # Jira REST API calls, ADF parsing
  login.ts          # OAuth 2.0 (3LO) browser login CLI
  format.ts         # JSON/Markdown formatters
  types.ts          # shared TypeScript interfaces
  tools/            # one file per MCP tool handler
scripts/
  parse_attachment.py   # Python parser for CSV/XLSX/PDF
  requirements.txt
```

## Adding a new tool

1. Create `src/tools/<name>.ts` with a `handle<Name>` function
2. Register it in `src/index.ts` with `server.registerTool()`
3. Add tests in `src/tools/tools.test.ts`

## Tests

Tests use [vitest](https://vitest.dev/). Mock `node:fs/promises` at module level for config tests:

```typescript
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, readFile: vi.fn(), writeFile: vi.fn() };
});
```

## Pull requests

- Keep PRs focused on one change
- All tests must pass (`npm test`)
- TypeScript must compile clean (`npx tsc --noEmit`)
