#!/usr/bin/env node
// Generates src/defaults.ts from environment variables or placeholders.
// Run before build: node scripts/generate-defaults.js
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const clientId = process.env.JIRA_CLIENT_ID_BUILTIN ?? '';
const clientSecret = process.env.JIRA_CLIENT_SECRET_BUILTIN ?? '';

const template = readFileSync(resolve(root, 'src/defaults.ts.template'), 'utf8');
const output = template
  .replace('__JIRA_CLIENT_ID__', clientId)
  .replace('__JIRA_CLIENT_SECRET__', clientSecret);

writeFileSync(resolve(root, 'src/defaults.ts'), output);
console.log(`Generated src/defaults.ts (clientId=${clientId ? '✓' : 'empty'})`);
