/**
 * Quick test script for authorization flow
 * Run: npx tsx test-auth.ts
 * 
 * This script helps test the new authorization feature:
 * 1. Creates a mock report
 * 2. Opens the review page in browser
 * 3. You can then test the auth flow manually
 */

import { generateReviewPage } from './src/pages/review';
import { generateSubject, generateEmailBody } from './src/template';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';

// Create mock data
const now = new Date();
const expiresAt = new Date(now.getTime() + 86400 * 1000);

const formatDate = (): string => {
  const formatter = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(now);
  const year = parts.find(p => p.type === 'year')?.value || '';
  const month = parts.find(p => p.type === 'month')?.value || '';
  const day = parts.find(p => p.type === 'day')?.value || '';
  return `${year}年${month}月${day}日`;
};

const mockDailyReport = {
  date: formatDate(),
  reports: [
    {
      parentKey: 'TEST-001',
      parentSummary: 'Test Release - Auth Feature',
      completedToday: [
        {
          key: 'TEST-101',
          summary: 'Add authorization modal to review page',
          assignee: 'Test User',
          completedAt: '2024-01-15 10:30',
          completedAtDate: new Date(now.getTime() - 120 * 60 * 1000),
        },
        {
          key: 'TEST-102',
          summary: 'Implement verify endpoint',
          assignee: 'Test User',
          completedAt: '2024-01-15 11:45',
          completedAtDate: new Date(now.getTime() - 60 * 60 * 1000),
        },
      ],
      totalSubtasks: 5,
      completedSubtasks: 3,
      progressPercent: 60,
    },
  ],
  totalCompletedToday: 2,
};

const mockReport = {
  id: 'auth-test-token',
  createdAt: now.toISOString(),
  expiresAt: expiresAt.toISOString(),
  dailyReport: mockDailyReport,
  defaultTo: 'client@example.com',
  defaultCc: 'manager@example.com',
  defaultSubject: generateSubject(mockDailyReport),
  defaultBody: generateEmailBody(mockDailyReport),
};

// Generate HTML
const html = generateReviewPage(mockReport);

// Write to temp file
const tempFile = path.join(process.cwd(), 'test-auth-preview.html');
fs.writeFileSync(tempFile, html, 'utf-8');

console.log('✅ Test HTML file created:', tempFile);
console.log('');
console.log('📝 Test Instructions:');
console.log('===================');
console.log('1. Open the HTML file in your browser');
console.log('   (It will open automatically in a few seconds)');
console.log('');
console.log('2. Test the authorization flow:');
console.log('   a) Click "メールを送信" button');
console.log('   b) You should see the authorization modal popup');
console.log('   c) Enter the SUPER_ADMIN_TOKEN from wrangler.toml: 888888');
console.log('   d) Click "验证" - it should accept the code');
console.log('   e) Preview modal should open automatically');
console.log('');
console.log('3. Test error handling:');
console.log('   a) Refresh the page (clear session)');
console.log('   b) Enter wrong code: 000000');
console.log('   c) Should show error and allow retry');
console.log('');
console.log('4. Test session persistence:');
console.log('   a) After successful auth, close preview');
console.log('   b) Click "メールを送信" again');
console.log('   c) Should skip auth and show preview directly');
console.log('');
console.log('⚠️  Note: Since this is a static HTML file:');
console.log('   - The API calls to /review/{token}/verify and /review/{token}/send will fail');
console.log('   - To fully test, run: npm run dev');
console.log('   - Then visit: http://localhost:8787/review/auth-test-token');
console.log('');

// Open in browser
console.log('Opening browser...');
exec(`open "${tempFile}"`, (error) => {
  if (error) {
    console.log('Could not open browser automatically. Please open the file manually.');
  }
});
