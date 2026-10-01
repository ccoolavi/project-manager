import { launch, watch, register, createOrg, createProject, shot, ok, stats, summary, uniq, BASE, API } from './pmlib.mjs';

import { execFileSync } from 'node:child_process';
const DB = process.env.PM_DB;
const VENV_PY = process.env.VENV_PY || (process.env.HOME + '/projects/project_manager/backend/venv/bin/python');
// Mail is off in the test stack: put a known code where the server checks it, then type it in like a person would.
const setKnownCode = (email, purpose) => execFileSync(VENV_PY, ['-c', `
import sqlite3, bcrypt
h = bcrypt.hashpw(b"123456", bcrypt.gensalt()).decode()
c = sqlite3.connect("${DB}")
uid = c.execute("select id from users where email=?", ("${email}",)).fetchone()[0]
rid = c.execute("select max(id) from email_otps where user_id=? and purpose=?", (uid, "${purpose}")).fetchone()[0]
c.execute("update email_otps set otp_hash=?, verified_at=NULL, expires_at=datetime('now','+10 minutes') where id=?", (h, rid))
c.commit()`]);
const until = async (fn, ms = 8000, step = 250) => { const end = Date.now() + ms; for (;;) { try { const v = await fn(); if (v) return v; } catch { /* keep polling */ } if (Date.now() > end) return false; await new Promise((r) => setTimeout(r, step)); } };
const queueDump = (pg) => pg.evaluate(() => new Promise((resolve) => {
  const open = indexedDB.open('kaizenpm-offline');
  open.onerror = () => resolve({ error: true, items: [] });
  open.onsuccess = () => {
    const db = open.result;
    if (!db.objectStoreNames.contains('queue')) { db.close(); return resolve({ items: [] }); }
    const req = db.transaction('queue').objectStore('queue').getAll();
    req.onsuccess = () => { db.close(); resolve({ items: req.result }); };
    req.onerror = () => { db.close(); resolve({ error: true, items: [] }); };
  };
}));
const RUN = uniq();
const N = (t) => `${t} ${RUN}`;
const warn = [];
const W = (msg) => { warn.push(msg); console.log('  WARN  ' + msg); };

const T = async (name, page, fn) => {
  console.log(`== ${name}`);
  try { await fn(); } catch (e) {
    ok(false, `${name} threw: ${String(e.message).split('\n')[0]}`);
    try { await shot(page, 'fail-' + name.replace(/\W+/g, '-').slice(0, 40)); } catch { /* ignore */ }
  }
};

const TABS = ['My Organizations', 'My Timeline', 'Tasks', 'Projects', 'Timeline', 'Calendar', 'Sprints', 'Habits', 'Time', 'Kaizen', 'Purpose', 'Workload', 'Analytics', 'Settings'];

const { browser, ctx } = await launch({ context: { serviceWorkers: 'allow' } });
const page = await ctx.newPage(); watch(page, 'D');
const tab = (name) => page.getByRole('button', { name, exact: true }).first();
const callApi = (method, path, body) => page.evaluate(async ({ method, path, body, api }) => {
  const r = await fetch(api + path, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('access_token') }, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await r.json(); } catch { /* none */ }
  return { status: r.status, json };
}, { method, path, body, api: API });
const rootOk = async () => !(await page.getByText('Something went wrong').count()) && (await page.locator('#root').innerHTML()).length > 200;

// ---------------------------------------------------------------- set up a workspace that has something on every screen
const EMAIL = `t3-${RUN}@example.com`;
await register(page, { email: EMAIL, name: 'Crawler' });
await createOrg(page, N('Crawl Org'));
const orgId = await page.evaluate(() => localStorage.getItem('current_org'));
const proj = (await callApi('POST', `/api/orgs/${orgId}/projects`, { name: N('Crawl Project'), status: 'active' })).json;
const sub = (await callApi('POST', `/api/orgs/${orgId}/projects/${proj.id}/sub-projects`, { name: 'General', status: 'active' })).json;
const today = new Date(); const iso = (d) => new Date(d).toISOString();
const plus = (n) => iso(today.getTime() + n * 86400000);
const members = (await callApi('GET', `/api/orgs/${orgId}/members`)).json;
const me = members[0].user_id;
const mk = async (title, extra = {}) => (await callApi('POST', `/api/orgs/${orgId}/projects/${proj.id}/tasks/${sub.id}`, { title, status: 'todo', priority: 'medium', ...extra })).json;
const t1 = await mk(N('Design'), { due_date: plus(2), start_date: plus(-1), assignee_id: me, story_points: 3 });
const t2 = await mk(N('Build'), { due_date: plus(5), start_date: plus(1), priority: 'high', assignee_id: me, story_points: 5, status: 'in_progress' });
await mk(N('Ship'), { due_date: plus(9), priority: 'urgent' });
await callApi('POST', `/api/orgs/${orgId}/projects/${proj.id}/tasks/${sub.id}/${t2.id}/comments`, { content: 'First comment' }).catch(() => {});
await callApi('POST', `/api/orgs/${orgId}/projects/${proj.id}/sprints`, { name: N('Sprint 1'), goal: 'Ship it', start_date: plus(-1), end_date: plus(13), status: 'active' });
await callApi('POST', '/api/habits', { title: N('Walk'), target_days: 5 });
await callApi('POST', `/api/orgs/${orgId}/kaizen`, { title: N('Kaizen A'), problem: 'p', solution: 's', category: 'workflow' });
await callApi('POST', `/api/orgs/${orgId}/time`, { duration_minutes: 45, category: 'meeting' });
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1200);

// ---------------------------------------------------------------- PWA
await T('P. installable PWA basics', page, async () => {
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href').catch(() => null);
  ok(!!manifestHref, 'the page links a web app manifest', manifestHref || '');
  const manifest = await page.evaluate(async (href) => { const r = await fetch(href); return r.ok ? await r.json() : null; }, manifestHref);
  ok(manifest && manifest.name && manifest.short_name && manifest.display === 'standalone' && /project-manager/.test(manifest.start_url), 'manifest has name, short name, standalone display and a start URL inside the app', manifest ? `${manifest.name} / ${manifest.display} / ${manifest.start_url}` : 'missing');
  const sizes = (manifest?.icons || []).map((i) => i.sizes);
  ok(sizes.includes('192x192') && sizes.includes('512x512'), 'manifest declares 192 and 512 pixel icons', sizes.join(', '));
  const iconStatuses = await page.evaluate(async (icons) => Promise.all(icons.map(async (i) => { const r = await fetch(i.src); return `${i.sizes}:${r.status}:${(r.headers.get('content-type') || '').split(';')[0]}`; })), manifest?.icons || []);
  ok(iconStatuses.length > 0 && iconStatuses.every((s) => /:200:image\/png/.test(s)), 'every manifest icon loads as a PNG', iconStatuses.join(', '));
  ok((await page.locator('link[rel="apple-touch-icon"]').count()) === 1, 'there is an iPhone home-screen icon');
  ok((await page.locator('meta[name="theme-color"]').count()) === 1 && (await page.locator('meta[name="viewport"]').getAttribute('content')).includes('width=device-width'), 'theme colour and a mobile viewport are set');
  const sw = await page.evaluate(async () => { const reg = await navigator.serviceWorker.getRegistration(); if (!reg) return null; await navigator.serviceWorker.ready; return { scope: reg.scope, state: (reg.active || {}).state }; });
  ok(sw && sw.state === 'activated', 'the service worker is registered and active', sw ? `${sw.scope} ${sw.state}` : 'none');
});

await T('P2. works with no connection', page, async () => {
  await tab('Tasks').click(); await page.waitForTimeout(800);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForTimeout(1500); // let the worker finish caching the app shell
  await ctx.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {}); await page.waitForTimeout(2500);
  const body = (await page.locator('body').innerText().catch(() => '')) || '';
  ok(!/ERR_INTERNET_DISCONNECTED|This site can.t be reached|No internet/i.test(body) && (await page.locator('#root').innerHTML().catch(() => '')).length > 200, 'reloading with no connection still opens the app (not the browser error page)', body.replace(/\s+/g, ' ').slice(0, 70));
  ok((await page.getByText(/Offline/i).count()) >= 1, 'the app says it is offline');
  const q1 = await queueDump(page);
  ok(q1.items.length === 0 && (await page.getByText(/\d+ changes? (saved on this device|waiting to save)/i).count()) === 0, 'opening the app offline does not invent a "change waiting to save" (the silent token refresh is not queued)', `queued: ${q1.items.map((i) => i.method + ' ' + i.url).join(', ') || 'none'}`);
  await shot(page, 't3-P2-offline');
  await ctx.setOffline(false); await page.waitForTimeout(1500);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1200);
  ok(await rootOk() && (await tab('Tasks').isVisible()), 'back online, the app is fully usable again');
});

await T('P3. logging out removes the offline copy of the data', page, async () => {
  const before = await page.evaluate(async () => (await caches.keys()).includes('api-cache'));
  await page.getByRole('button', { name: 'Log out' }).click(); await page.waitForTimeout(1500);
  const after = await page.evaluate(async () => (await caches.keys()).includes('api-cache'));
  ok(!after, 'the saved copy of the previous person\'s data is gone after Log out', `before: ${before}, after: ${after}`);
  // sign back in for the rest
  await page.locator('input[type="email"], input[type="text"]').first().fill(EMAIL);
  await page.locator('input[type="password"]').first().fill('TestPass123');
  await page.getByRole('button', { name: /^(sign in|log in|login)/i }).click(); await page.waitForTimeout(2000);
  ok(await tab('Tasks').isVisible(), 'signing in again works');
});

await T('P4. an offline sign-in attempt does not store the password', page, async () => {
  await page.getByRole('button', { name: 'Log out' }).click(); await page.waitForTimeout(1200);
  await ctx.setOffline(true);
  await page.locator('#login-identifier').fill(EMAIL);
  await page.locator('#login-password').fill('SecretPass-for-test-77');
  await page.getByRole('button', { name: /^(sign in|log in|login)/i }).click();
  await until(async () => /reach the server|connection/i.test(await page.locator('body').innerText()), 8000);
  ok(/reach the server|connection/i.test(await page.locator('body').innerText()), 'the sign-in form explains it cannot reach the server');
  const dump = JSON.stringify((await queueDump(page)).items);
  ok(!/SecretPass-for-test-77/.test(dump) && (await queueDump(page)).items.length === 0, 'nothing from the sign-in attempt (least of all the password) was written to the device', `queued entries: ${(await queueDump(page)).items.length}`);
  await ctx.setOffline(false); await page.waitForTimeout(1200);
  await page.locator('#login-password').fill('TestPass123');
  await page.getByRole('button', { name: /^(sign in|log in|login)/i }).click(); await page.waitForTimeout(2500);
  ok(await tab('Tasks').isVisible(), 'back online, signing in works');
});

await T('S. an expired session is renewed silently', page, async () => {
  await tab('Projects').click(); await page.waitForTimeout(700);
  await page.getByText(N('Crawl Project'), { exact: true }).first().click(); await page.waitForTimeout(600);
  await tab('Tasks').click(); await page.getByLabel('New task title').waitFor({ timeout: 8000 });
  const before = await page.evaluate(() => { const a = localStorage.getItem('access_token'); localStorage.setItem('access_token', a.slice(0, -4) + 'XXXX'); return a; });   // now invalid, like one that has expired
  await page.getByLabel('New task title').fill(N('After expiry')); await page.getByRole('button', { name: 'Add task' }).click();
  await until(async () => (await page.getByText(N('After expiry'), { exact: true }).count()) === 1, 12000);
  ok((await page.getByText(N('After expiry'), { exact: true }).count()) === 1 && !/#\/login/.test(page.url()), 'the task is added after the access token expired, with no sign-in screen in between');
  const after = await page.evaluate(() => localStorage.getItem('access_token'));
  ok(!!after && after !== before && !after.endsWith('XXXX'), 'a fresh access token was stored');
  const asBearer = await page.evaluate(async (api) => (await fetch(api + '/api/orgs', { headers: { Authorization: 'Bearer ' + localStorage.getItem('refresh_token') } })).status, API);
  ok(asBearer === 401, 'the long-lived refresh token cannot be used as an everyday API credential', 'HTTP ' + asBearer);
  // Analytics fires four requests at once: if they all fail as expired, they must share ONE renewal and all succeed
  await page.evaluate(() => { const a = localStorage.getItem('access_token'); localStorage.setItem('access_token', a.slice(0, -4) + 'YYYY'); });
  let renewals = 0; const count = (r) => { if (/token\/refresh/.test(r.url())) renewals++; }; page.on('request', count);
  await tab('Analytics').click();
  await until(async () => /Habit consistency/i.test(await page.locator('main').innerText()), 12000);
  page.off('request', count);
  ok(/Habit consistency/i.test(await page.locator('main').innerText()) && !/Could not load/.test(await page.locator('main').innerText()), 'a screen that makes several requests at once still loads after the session expired');
  ok(renewals === 1, 'those simultaneous failures shared a single renewal', `renewal requests: ${renewals}`);
  await tab('Tasks').click(); await page.waitForTimeout(600);
  // when there is truly no valid session left, the person is taken to sign in
  await page.evaluate(() => { localStorage.setItem('access_token', 'bad.bad.bad'); localStorage.setItem('refresh_token', 'bad.bad.bad'); });
  await tab('Habits').click();    // opening the screen makes a request: refused, renewal refused -> signed out
  await until(async () => /#\/login/.test(page.url()), 10000);
  ok(/#\/login/.test(page.url()) && (await page.locator('#login-identifier').isVisible()), 'with no valid session left the person really is signed out and shown the sign-in form');
  ok(/session ended/i.test(await page.locator('body').innerText()), 'and is told why ("Your session ended")');
  await page.locator('input[type="email"], input[type="text"]').first().fill(EMAIL);
  await page.locator('input[type="password"]').first().fill('TestPass123');
  await page.getByRole('button', { name: /^(sign in|log in|login)/i }).click();
  await until(async () => await tab('Tasks').isVisible(), 10000);
  ok(await tab('Tasks').isVisible(), 'signing in again works');
});

// ---------------------------------------------------------------- phone size
const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const mp = await mctx.newPage(); watch(mp, 'M');
const mtab = (name) => mp.getByRole('navigation', { name: 'Main' }).getByRole('button', { name, exact: true });
await T('M. phone-size walkthrough of every screen', mp, async () => {
  await mp.goto(BASE + '#/login', { waitUntil: 'networkidle' });
  await mp.locator('input[type="email"], input[type="text"]').first().fill(EMAIL);
  await mp.locator('input[type="password"]').first().fill('TestPass123');
  await mp.getByRole('button', { name: /^(sign in|log in|login)/i }).click();
  await until(async () => (await mp.locator('#login-code').count()) > 0 || (await mtab('Tasks').count()) > 0, 10000);
  if (await mp.locator('#login-code').count()) {   // a phone the account has never used: the emailed code is required
    await mp.waitForTimeout(800); setKnownCode(EMAIL, 'login_device');
    await mp.locator('#login-code').fill('123456'); await mp.getByRole('button', { name: /Verify and continue/ }).click();
  }
  await until(async () => await mtab('Tasks').isVisible(), 10000);
  ok(await mtab('Tasks').isVisible(), 'the bottom navigation bar is shown on a phone');
  for (const name of TABS) {
    await mtab(name).scrollIntoViewIfNeeded().catch(() => {});
    await mtab(name).click(); await mp.waitForTimeout(900);
    const m = await mp.evaluate(() => {
      const doc = document.documentElement;
      const bar = document.querySelector('nav[aria-label="Main"]');
      const barTop = bar ? bar.getBoundingClientRect().top : innerHeight;
      // anything wider than the screen that is not inside its own horizontal scroller
      const wide = [...document.querySelectorAll('body *')].filter((e) => {
        const r = e.getBoundingClientRect();
        if (r.width === 0 || r.right <= innerWidth + 1) return false;
        for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden') return false; }
        return !bar.contains(e) && getComputedStyle(e).position !== 'fixed';
      }).slice(0, 3).map((e) => `${e.tagName.toLowerCase()}.${String(e.className).split(' ')[0]}`);
      window.scrollTo(0, document.body.scrollHeight);
      const last = [...document.querySelectorAll('main button, main input, main select, main textarea')].filter((e) => e.offsetParent).pop();
      return { overflow: doc.scrollWidth - doc.clientWidth, wide, lastBottom: last ? last.getBoundingClientRect().bottom : 0, barTop };
    });
    ok(m.overflow <= 1 && m.wide.length === 0, `${name}: nothing is wider than the phone screen`, m.overflow > 1 ? `page is ${m.overflow}px too wide` : m.wide.join(', '));
    if (m.lastBottom > m.barTop + 2) W(`${name}: the last control is hidden behind the bottom bar by ${Math.round(m.lastBottom - m.barTop)}px`);
    ok(await rootOk(), `${name}: opens without crashing`);
  }
  await shot(mp, 't3-M-last');
});

await T('M2. search and adding a task on a phone', mp, async () => {
  await mtab('Tasks').click(); await mp.waitForTimeout(1200);
  const open = mp.getByRole('button', { name: 'Open search' });
  ok(await open.isVisible(), 'a search button is available on a phone');
  await open.click(); await mp.waitForTimeout(300);
  const box = mp.locator('input[aria-label="Search"]:visible');
  await box.fill(N('Design').slice(0, 10)); await mp.waitForTimeout(1200);
  ok((await mp.getByRole('button', { name: new RegExp(N('Design')) }).count()) >= 1, 'typing lists matching items');
  await mtab('Habits').click(); await mp.waitForTimeout(300);
  await mp.getByRole('button', { name: 'Open search' }).click().catch(() => {});
  await mp.locator('input[aria-label="Search"]:visible').fill(N('Design').slice(0, 10)); await mp.waitForTimeout(1200);
  await mp.getByRole('button', { name: new RegExp(N('Design')) }).first().click(); await mp.waitForTimeout(1200);
  ok((await mp.getByLabel('New task title').count()) === 1, 'choosing a result opens that task\'s board and closes the search');
  await mp.getByLabel('New task title').fill(N('Phone task')); await mp.getByRole('button', { name: 'Add task' }).tap(); await mp.waitForTimeout(1500);
  ok((await mp.getByText(N('Phone task'), { exact: true }).count()) === 1, 'adding a task by tapping works on a phone');
  await shot(mp, 't3-M2-phone-board');
});

// ---------------------------------------------------------------- crawler
await T('C. press every control on every screen', page, async () => {
  await page.goto(BASE + '#/dashboard', { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
  const SKIP = /delete|remove|leave|log ?out|revoke|sign out|clear selection|cancel|confirm/i;
  let pressed = 0; const dead = []; const crashed = [];
  for (const name of TABS) {
    await tab(name).click(); await page.waitForTimeout(900);
    const count = await page.locator('main button:visible, main [role="button"]:visible').count();
    for (let i = 0; i < Math.min(count, 40); i++) {
      const el = page.locator('main button:visible, main [role="button"]:visible').nth(i);
      const label = ((await el.getAttribute('aria-label').catch(() => null)) || (await el.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim().slice(0, 50);
      if (!label || SKIP.test(label)) continue;
      const before = await page.evaluate(() => document.body.innerText.length + '|' + location.hash + '|' + document.querySelectorAll('[data-toast]').length + '|' + document.querySelectorAll('input:checked').length + '|' + document.activeElement?.tagName);
      let reqs = 0; const onReq = () => reqs++; page.on('request', onReq);
      const errsBefore = stats.pageErrors.length;
      try { await el.click({ timeout: 2500 }); } catch { page.off('request', onReq); continue; }
      await page.waitForTimeout(450); page.off('request', onReq);
      pressed++;
      if (stats.pageErrors.length > errsBefore || (await page.getByText('Something went wrong').count())) {
        crashed.push(`${name} > "${label}"`);
        await page.getByRole('button', { name: 'Reload the app' }).click().catch(() => {}); await page.waitForTimeout(1500);
        await tab(name).click().catch(() => {}); await page.waitForTimeout(600);
      }
      const afterState = await page.evaluate(() => document.body.innerText.length + '|' + location.hash + '|' + document.querySelectorAll('[data-toast]').length + '|' + document.querySelectorAll('input:checked').length + '|' + document.activeElement?.tagName);
      if (afterState === before && reqs === 0) dead.push(`${name} > "${label}"`);
      await page.keyboard.press('Escape').catch(() => {});
      // put the screen back if the click moved us (e.g. opened a task panel or another tab)
      const still = await page.locator('main button:visible, main [role="button"]:visible').count();
      if (still < 1) { await tab(name).click().catch(() => {}); await page.waitForTimeout(500); }
    }
  }
  console.log(`     pressed ${pressed} controls across ${TABS.length} screens`);
  ok(crashed.length === 0, 'no control crashed any screen', crashed.slice(0, 3).join(' | '));
  ok(pressed >= 30, 'a meaningful number of controls were exercised', String(pressed));
  if (dead.length) W(`${dead.length} controls showed no visible reaction (review): ${[...new Set(dead)].slice(0, 12).join(' ; ')}`);
});

console.log('\n--- app-wide checks');
ok(stats.pageErrors.length === 0, 'no uncaught page errors in the whole run', stats.pageErrors.slice(0, 2).join(' | '));
const unexpected = stats.apiErrors.filter((e) => !/ -> (401|403|404|409|422|428|429)/.test(e));
ok(unexpected.length === 0, 'no 5xx or unexpected server errors in the whole run', unexpected.slice(0, 2).join(' | '));

summary('t3 pwa/mobile/crawl');
if (warn.length) console.log(`    ${warn.length} warning(s) above need a human look`);
await browser.close();
process.exit(stats.fail ? 1 : 0);
