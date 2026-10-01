// Shared helpers for the KaizenPM browser tests. Everything runs against the ISOLATED stack (local API on :18090, local site on
// :15173, throwaway database). Requests to the live hosts are blocked and counted so a leak is impossible AND detectable.
import { chromium } from 'playwright-core';
import fs from 'node:fs';

export const BASE = process.env.PM_BASE || 'http://127.0.0.1:15173/project-manager/';
export const API = process.env.PM_API || 'http://127.0.0.1:18090';
export const SHOTS = process.env.SHOTS || '/tmp/pm-shots';
fs.mkdirSync(SHOTS, { recursive: true });

export const stats = { pass: 0, fail: 0, leaks: [], apiErrors: [], consoleErrors: [], pageErrors: [], failures: [] };
export function ok(cond, msg, extra = '') {
  if (cond) { stats.pass++; console.log('  PASS  ' + msg + (extra ? '  [' + extra + ']' : '')); }
  else { stats.fail++; stats.failures.push(msg); console.log('  FAIL  ' + msg + (extra ? '  [' + extra + ']' : '')); }
  return !!cond;
}

export async function launch(opts = {}) {
  const browser = await chromium.launch({
    executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1234/chrome-linux/chrome',
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1280, height: 900 }, colorScheme: 'light', ...(opts.context || {}) });
  await ctx.route(/trycloudflare\.com|github\.io|api\.github\.com/, (route) => { stats.leaks.push(route.request().url()); route.abort(); });
  return { browser, ctx };
}

export function watch(page, label = '') {
  page.on('response', async (r) => {
    const u = r.url();
    if (u.startsWith(API) && r.status() >= 400) {
      let body = ''; try { body = (await r.text()).slice(0, 120); } catch { /* ignore */ }
      stats.apiErrors.push(`${label} ${r.request().method()} ${u.replace(API, '')} -> ${r.status()} ${body}`);
    }
  });
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource.*(401|403|404|409|422|428|429)/.test(m.text())) stats.consoleErrors.push(`${label} ${m.text().slice(0, 160)}`); });
  page.on('pageerror', (e) => stats.pageErrors.push(`${label} ${e.message.slice(0, 160)}`));
}

export const uniq = () => Date.now().toString(36) + Math.floor(Math.random() * 1000).toString(36);

export async function register(page, { name = 'Test User', email, password = 'TestPass123' } = {}) {
  await page.goto(BASE + '#/register', { waitUntil: 'networkidle' });
  await page.locator('input[type="text"]').first().fill(name);
  await page.locator('input[type="email"]').fill(email);
  const pw = page.locator('input[type="password"]');
  await pw.nth(0).fill(password); await pw.nth(1).fill(password);
  await page.getByRole('button', { name: /sign up|create|register/i }).click();
  await page.waitForTimeout(1500);
}

export async function login(page, { email, password = 'TestPass123' }) {
  await page.goto(BASE + '#/login', { waitUntil: 'networkidle' });
  await page.locator('input[type="email"], input[type="text"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.getByRole('button', { name: /^(sign in|log in|login)/i }).click();
  await page.waitForTimeout(1500);
}

export async function createOrg(page, name) {
  await page.locator('input[placeholder*="Organization" i]').fill(name);
  await page.getByRole('button', { name: /create organization/i }).click();
  await page.waitForTimeout(1500);
}

export async function createProject(page, name) {
  const box = page.locator('input[placeholder*="New project" i]');
  await box.fill(name); await box.press('Enter');
  await page.waitForTimeout(1200);
}

export async function shot(page, name) { await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }); }

export function summary(title) {
  console.log(`\n=== ${title}: ${stats.pass} passed, ${stats.fail} failed`);
  console.log(`    live-host requests blocked (must be 0): ${stats.leaks.length}${stats.leaks.length ? ' -> ' + stats.leaks[0] : ''}`);
  if (stats.pageErrors.length) console.log('    page errors:', stats.pageErrors.slice(0, 4));
  if (stats.consoleErrors.length) console.log('    console errors:', stats.consoleErrors.slice(0, 4));
  if (stats.apiErrors.length) console.log('    api 4xx/5xx seen:', stats.apiErrors.slice(0, 8));
}
