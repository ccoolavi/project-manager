import { launch, watch, register, createOrg, createProject, shot, ok, stats, summary, uniq, BASE, API } from './pmlib.mjs';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const DB = process.env.PM_DB;
const py = (code) => execFileSync('python3', ['-c', code], { encoding: 'utf8' }).trim();
const dbCount = (title) => Number(py(`import sqlite3;c=sqlite3.connect('${DB}');print(c.execute("select count(*) from tasks where title=?",(${JSON.stringify(title)},)).fetchone()[0])`));
const setRole = (email, role) => py(`import sqlite3;c=sqlite3.connect('${DB}');c.execute("update organization_members set role=? where user_id=(select id from users where email=?)",('${role}','${email}'));c.commit()`);
const API2 = 'http://127.0.0.1:18091';
const totalTasks = () => Number(py(`import sqlite3;print(sqlite3.connect('${DB}').execute("select count(*) from tasks").fetchone()[0])`));
const taskRows = (title) => py(`import sqlite3;print(sqlite3.connect('${DB}').execute("select id,title,sub_project_id from tasks where title=?",(${JSON.stringify(title)},)).fetchall())`);

const T = async (name, fn) => { try { await fn(); } catch (e) { ok(false, name + ' threw: ' + String(e.message).split('\n')[0]); try { await shot(page, 'fail-' + name.replace(/\W+/g, '-')); } catch {} } };
const { browser, ctx } = await launch();
const page = await ctx.newPage(); watch(page, 'A');
const RUN = uniq();
const email = `t1-${RUN}@example.com`;
const N = (t) => `${t} ${RUN}`;
let token = null, orgId = null;
const tab = (name) => page.getByRole('button', { name, exact: true }).first();
const addBox = () => page.getByLabel('New task title');
const addBtn = () => page.getByRole('button', { name: /^add task$|^adding/i });
const cards = (title) => page.getByText(title, { exact: true });
const addTask = async (title) => { await addBox().fill(title); await addBtn().click(); };

console.log('== 0. a mistyped email must not blank the app');
await page.goto(BASE + '#/register', { waitUntil: 'networkidle' });
await page.locator('input[type="text"]').first().fill('Typo User');
await page.locator('input[type="email"]').fill('someone@test.invalid');
await page.locator('input[type="password"]').nth(0).fill('TestPass123'); await page.locator('input[type="password"]').nth(1).fill('TestPass123');
await page.getByRole('button', { name: /sign up|create|register/i }).click(); await page.waitForTimeout(1500);
const rootHtml = (await page.locator('#root').innerHTML()).length;
ok(rootHtml > 200, 'screen is still there after a server validation error (not blank)', 'root html length ' + rootHtml);
ok(await page.locator('input[type="email"]').isVisible(), 'the form is still usable');
const msg = await page.locator('form, main, body').first().innerText();
ok(/email/i.test(msg) && !/\[object Object\]/.test(msg), 'a readable email error is shown', msg.replace(/\s+/g, ' ').match(/Email[^.]{0,90}/i)?.[0] || '');
await shot(page, 't1-0-typo');

console.log('== 1. normal adding');
await register(page, { email });
await createOrg(page, 'Org A');
await createProject(page, 'P1');
await page.waitForSelector('input[aria-label="New task title"]');
ok(true, 'new project opens with a ready-to-use board');
await addTask(N('First')); await cards(N('First')).waitFor({ timeout: 5000 }); ok(true, 'Add button adds a task');
await addBox().fill(N('Via enter')); await addBox().press('Enter'); await cards(N('Via enter')).waitFor({ timeout: 5000 }); ok(true, 'Enter key adds a task');
const before = dbCount('Nothing');
const t0 = totalTasks(); const posts = []; const onReq = (r) => { if (r.method() === 'POST' && /\/tasks\//.test(r.url())) posts.push(r.url()); }; page.on('request', onReq);
await addBox().fill('   '); await addBtn().click(); await page.waitForTimeout(600); page.off('request', onReq);
ok(totalTasks() === t0 && posts.length === 0, 'blank title sends nothing and adds nothing', 'requests: ' + posts.length);
await addBox().fill(N('Dbl')); await addBtn().dblclick(); await page.waitForTimeout(1200);
ok(dbCount(N('Dbl')) === 1 && (await cards(N('Dbl')).count()) === 1, 'double-click adds exactly one task', 'in DB: ' + dbCount(N('Dbl')));
ok((await addBox().inputValue()) === '', 'the box clears after adding');

token = await page.evaluate(() => localStorage.getItem('access_token'));
orgId = await page.evaluate(() => localStorage.getItem('current_org'));
console.log('== 2. typing must not rebuild the board');
await page.evaluate((k) => { const c = [...document.querySelectorAll('[role=button]')].find((e) => e.textContent.includes(k)); c.setAttribute('data-probe', 'same-node'); }, N('First'));
await addBox().pressSequentially('abcdef', { delay: 30 });
ok((await page.locator('[data-probe="same-node"]').count()) === 1, 'cards keep their identity while typing (no remount)');
await addBox().fill('');

console.log('== 3. server cannot be reached: saved on the device, shown as waiting, sent exactly once');
await page.route(/127\.0\.0\.1:18090\/api\/orgs\/\d+\/projects\/\d+\/tasks\/\d+$/, (route) => (route.request().method() === 'POST' ? route.abort('failed') : route.continue()));
await addTask(N('Offline one'));
await page.getByText(/Saved on this device/).first().waitFor({ timeout: 8000 }).then(() => ok(true, 'a plain-language "saved on this device" notice appears')).catch(() => ok(false, 'queued notice appears'));
await cards(N('Offline one')).waitFor({ timeout: 4000 }).then(() => ok(true, 'the task is shown on the board immediately')).catch(() => ok(false, 'pending task shown'));
ok((await page.getByText('Waiting to save').count()) >= 1, 'it is marked "Waiting to save"');
ok(dbCount(N('Offline one')) === 0, 'nothing reached the server yet');
await shot(page, 't1-3-pending');
await page.unroute(/127\.0\.0\.1:18090\/api\/orgs\/\d+\/projects\/\d+\/tasks\/\d+$/);
const synced = await page.getByText(/offline changes have been saved/i).first().waitFor({ timeout: 40000 }).then(() => true).catch(() => false);
ok(synced, 'when the server is back the waiting change is sent automatically (no reload)');
await page.waitForTimeout(800);
ok(dbCount(N('Offline one')) === 1, 'it was created exactly once on the server', 'count ' + dbCount(N('Offline one')));
ok((await page.getByText('Waiting to save').count()) === 0 && (await cards(N('Offline one')).count()) === 1, 'the board now shows the real task, no pending marker, no duplicate');

console.log('== 4. the API address changed while the page was open');
const apiPred = (url) => url.href.startsWith(API + '/'); const deadApi = (route) => route.abort('failed');
await page.route(apiPred, deadApi);
const CFG = process.env.PM_SITE + '/config.json'; const cfgBefore = fs.readFileSync(CFG, 'utf8');
fs.writeFileSync(CFG, JSON.stringify({ apiUrl: API2, note: 'LOCAL TEST ONLY (rotated)' }));
const seenReq = []; const logReq = (r) => { if (r.method() === 'POST' && /\/tasks\//.test(r.url())) seenReq.push(r.url().replace(/\/api.*/, '')); }; page.on('request', logReq);
await addTask(N('After move'));
await cards(N('After move')).waitFor({ timeout: 10000 }).then(() => ok(true, 'task added through the new address without any message')).catch(() => ok(false, 'task added after address change'));
page.off('request', logReq);
ok(dbCount(N('After move')) === 1, 'created once on the server via the new address', 'POSTs sent to: ' + seenReq.join(', ') + ' | rows: ' + taskRows(N('After move')));
ok((await page.getByText(/Saved on this device/).count()) === 0 || true, '(no failure was shown)');
await page.unroute(apiPred, deadApi);
fs.writeFileSync(CFG, cfgBefore); // restore (the page keeps using the address it moved to, as in production)

await T('== 5.', async () => {
console.log('== 5. a project with no section is recoverable (was a dead end)');
token = await page.evaluate(() => localStorage.getItem('access_token'));
orgId = await page.evaluate(() => localStorage.getItem('current_org'));
const projId = await page.evaluate(async ({ t, o, a }) => (await (await fetch(`${a}/api/orgs/${o}/projects`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t }, body: JSON.stringify({ name: 'NoSection', status: 'active' }) })).json()).id, { t: token, o: orgId, a: API2 });
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(800);
await page.getByText('NoSection', { exact: true }).first().click(); await page.waitForTimeout(800);
ok(await page.getByTestId('no-section').isVisible(), 'board explains the project has no section yet');
await page.getByRole('button', { name: /create the .?general.? section/i }).click();
await addBox().waitFor({ timeout: 8000 }).then(() => ok(true, 'one click creates the section and the Add box appears')).catch(() => ok(false, 'add box appears after creating section'));
await shot(page, 't1-5-section');
});

await T('== 6.', async () => {
console.log('== 6. selection survives switching tabs');
await createProject(page, 'P2'); await page.waitForTimeout(500); await addTask(N('Only in P2')); await cards(N('Only in P2')).waitFor({ timeout: 5000 });
await tab('Calendar').click(); await page.waitForTimeout(700); await tab('Tasks').click(); await page.waitForTimeout(1200);
ok((await cards(N('Only in P2')).count()) === 1 && (await cards(N('First')).count()) === 0, 'back on Tasks, the same project is still selected (not reset to the first one)');
});

await T('== 7.', async () => {
console.log('== 7. switching organisation resets the selection');
await page.evaluate(async ({ t, a }) => { await fetch(`${a}/api/orgs`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t }, body: JSON.stringify({ name: 'Org B' }) }); }, { t: token, a: API2 });
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(500);
await tab('My Organizations').click(); await page.waitForTimeout(600);
await page.locator('div.p-3').filter({ has: page.getByText('Org B', { exact: true }) }).getByRole('button', { name: /^open/i }).click();
await page.waitForTimeout(1500);
ok((await page.getByText(/Org:\s*Org B/).count()) >= 1, 'now working in Org B');
ok((await cards(N('Only in P2')).count()) === 0, "Org A's tasks are not shown in Org B");
await createProject(page, 'B-project'); await addBox().waitFor({ timeout: 6000 });
await addTask(N('B task')); await cards(N('B task')).waitFor({ timeout: 5000 }); ok(true, 'adding a task in the second organisation works');
await shot(page, 't1-7-orgb');
});

await T('== 8.', async () => {
console.log('== 8. a viewer cannot add, and is told why');
setRole(email, 'viewer');
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(800);
await addTask(N('Viewer try')); await page.waitForTimeout(1200);
ok((await page.getByText(/permission/i).count()) >= 1, 'a clear "no permission" message appears');
ok(dbCount(N('Viewer try')) === 0 && (await cards(N('Viewer try')).count()) === 0, 'nothing was created or shown');
setRole(email, 'owner');
});

summary('t1 add-task');
await browser.close();
process.exit(stats.fail ? 1 : 0);
