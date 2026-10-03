// My Timeline (all organisations): clashes, workload, filters, views, phone width, failure handling.
// ISOLATED stack only (see README.md): seeds through the throwaway API, then drives the real page in Chromium.
import { launch, watch, shot, ok, stats, summary, uniq, BASE, API } from './pmlib.mjs';

const RUN = uniq();
const N = (t) => `${t} ${RUN}`;
const ME = `plan-${RUN}@example.com`, MATE = `mate-${RUN}@example.com`, LONELY = `lonely-${RUN}@example.com`;
const PW = 'TestPass123';

// ---------- seeding through the API ----------
const call = async (method, path, token, body) => {
  const res = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  if (res.status >= 300) throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 150)}`);
  return json;
};
const signUp = (email, name) => call('POST', '/api/auth/register', null, { name, email, password: PW, confirm_password: PW });
const signIn = async (email) => (await call('POST', '/api/auth/login', null, { identifier: email, password: PW })).access_token;
const dayStr = (offset) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + offset); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T00:00:00`; };

await signUp(ME, 'Planner Person'); await signUp(MATE, 'Team Mate'); await signUp(LONELY, 'Lonely User');
let tok = await signIn(ME);
const org1 = await call('POST', '/api/orgs', tok, { name: N('Sujata') });
const org2 = await call('POST', '/api/orgs', tok, { name: N('Kaizen') });
tok = await signIn(ME);
const build = async (org, pname) => {
  const p = await call('POST', `/api/orgs/${org.id}/projects`, tok, { name: pname, status: 'active' });
  const s = await call('POST', `/api/orgs/${org.id}/projects/${p.id}/sub-projects`, tok, { name: 'Section', status: 'active' });
  return { org, p, s, url: `/api/orgs/${org.id}/projects/${p.id}/tasks/${s.id}` };
};
const A = await build(org1, N('Shop')), B = await build(org2, N('Product'));
const members = await call('GET', `/api/orgs/${org1.id}/members`, tok);
const meId = members[0].user_id;
await call('POST', `/api/orgs/${org1.id}/members`, tok, { email: MATE, role: 'member' });
const mateId = (await call('GET', `/api/orgs/${org1.id}/members`, tok)).find((m) => m.user_id !== meId).user_id;

const mk = (ctx, title, extra = {}) => call('POST', ctx.url, tok, { title: N(title), status: 'todo', priority: 'medium', assignee_id: meId, ...extra });
const clash1 = await mk(A, 'Clash One', { due_date: dayStr(3), estimate_hours: 6 });
const clash2 = await mk(B, 'Clash Two', { due_date: dayStr(3), estimate_hours: 6 });
await mk(A, 'Long job', { start_date: dayStr(5), due_date: dayStr(9), estimate_hours: 10 });
const blocker = await mk(A, 'Blocker', { due_date: dayStr(14) });
const blocked = await mk(A, 'Blocked job', { start_date: dayStr(10), due_date: dayStr(12) });
await call('POST', `${A.url}/${blocked.id}/dependencies`, tok, { depends_on_id: blocker.id });
await mk(A, 'Late one', { due_date: dayStr(-3) });
await mk(A, 'Someday', {});
await mk(A, 'Finished', { status: 'done', due_date: dayStr(2) });
await mk(A, 'Mates job', { assignee_id: mateId, due_date: dayStr(3), estimate_hours: 9 });

// ---------- helpers ----------
const until = async (fn, ms = 8000, step = 200) => { const end = Date.now() + ms; for (;;) { try { const v = await fn(); if (v) return v; } catch { /* keep polling */ } if (Date.now() > end) return false; await new Promise((r) => setTimeout(r, step)); } };
const T = async (name, page, fn) => {
  console.log(`== ${name}`);
  try { await fn(); } catch (e) { ok(false, `${name} threw: ${String(e.message).split('\n')[0]}`); try { await shot(page, 'fail-t4-' + name.replace(/\W+/g, '-').slice(0, 40)); } catch { /* ignore */ } }
};

// A browser sign-in from a new device asks for an emailed code, and this stack cannot send mail. The app itself is
// unchanged: we sign in through the API and hand the saved session to the browser, exactly as the app stores it.
const login = async (page, { email, orgId } = {}) => {
  const res = await call('POST', '/api/auth/login', null, { identifier: email, password: PW });
  await page.goto(BASE + '#/login', { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ res, orgId }) => {
    localStorage.setItem('access_token', res.access_token);
    localStorage.setItem('refresh_token', res.refresh_token);
    localStorage.setItem('user', JSON.stringify(res.user));
    if (orgId) localStorage.setItem('current_org', String(orgId));
  }, { res, orgId });
  // The app reads the saved session when it starts, so it must start AFTER the session is written.
  await page.goto(BASE + '#/dashboard');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
};

const { browser, ctx } = await launch();
const page = await ctx.newPage(); watch(page, 'A');
const tab = (name) => page.getByRole('button', { name, exact: true }).first();
const banner = page.getByTestId('timeline-banner');
const bannerTone = () => banner.getAttribute('data-tone');
const overCells = () => page.locator('[data-testid="load-strip"] [data-level="over"], [data-testid="load-strip"] [data-level="severe"]');
const lanes = () => page.getByTestId('timeline-lane');
const weekPanel = async (want) => { const isOpen = (await page.getByLabel('Hours per day').count()) > 0; if (isOpen !== want) await page.getByRole('button', { name: 'Working week' }).click(); };
const openMyTimeline = async () => { await tab('My Timeline').click(); await banner.waitFor({ timeout: 10000 }); };

await login(page, { email: ME, orgId: org1.id });
await openMyTimeline();

await T('A. the clash across two organisations is found and explained', page, async () => {
  ok((await bannerTone()) === 'bad', 'the headline is red: 12 hours on one day is severe');
  const text = await banner.innerText();
  ok(/Next 2 weeks: 1 overloaded day/.test(text) && /2 tasks across 2 organisations/.test(text) && /12 h of 8 h/.test(text), 'the headline names the day, the two tasks, the two organisations and the hours', text.replace(/\s+/g, ' '));
  ok((await overCells().count()) === 1, 'exactly one day is marked overloaded on the load strip');
  const label = await overCells().first().getAttribute('aria-label');
  ok(/Severely overloaded/.test(label) && label.includes(N('Sujata')) && label.includes(N('Kaizen')), 'that day says how bad it is and names both organisations', label);
  ok((await lanes().count()) === 2, 'there is one lane per organisation');
  const l1 = lanes().filter({ hasText: N('Sujata') }), l2 = lanes().filter({ hasText: N('Kaizen') });
  ok((await l1.locator(`[data-task-id="${clash1.id}"]`).count()) === 1 && (await l2.locator(`[data-task-id="${clash2.id}"]`).count()) === 1, 'each task sits in its own organisation lane');
  ok((await page.locator(`[data-task-id="${clash1.id}"][data-clash="true"]`).count()) >= 1 && (await page.locator(`[data-task-id="${clash2.id}"][data-clash="true"]`).count()) >= 1, 'both tasks that cause the clash carry the clash mark');
  ok((await page.locator('[data-testid="my-timeline-lanes"] [data-clash="severe"]').count()) === 1, 'the clash day is shaded down through the lanes');
  await shot(page, 't4-A-timeline');
});

await T('B. only my own open tasks are shown, and the odd ones are listed', page, async () => {
  const body = await page.locator('main').innerText();
  ok(!body.includes(N('Mates job')), "a team-mate's task never appears");
  ok(!body.includes(N('Finished')), 'a finished task is hidden by default');
  ok((await page.getByTestId('overdue-list').getByText(N('Late one')).count()) === 1, 'the overdue task is listed under Overdue');
  ok((await page.getByTestId('unscheduled-list').getByText(N('Someday')).count()) === 1, 'the task with no due date is listed under No due date, not dropped');
  const blockedBar = page.locator(`[data-task-id="${blocked.id}"]`).first();
  ok((await blockedBar.getAttribute('aria-label')).includes('blocked'), 'a blocked task says it is blocked');
  await page.getByText(/Heads-up list/).click();
  const heads = await page.getByTestId('warnings-panel').innerText();
  ok(/before the task blocking it is due/.test(heads) && heads.includes(N('Blocked job')), 'starting before the blocker is due is listed in plain words');
  ok(/was due .* and is still open/.test(heads) && heads.includes(N('Late one')), 'the overdue task is in the heads-up list');
  ok(/12 h of work on a 8 h day across 2 organisations/.test(heads), 'the overload is in the heads-up list with hours and the organisation count');
  await page.getByText(/Heads-up list/).click();
  await page.getByRole('checkbox', { name: 'Show done' }).check();
  ok(await until(async () => (await page.locator('main').innerText()).includes(N('Finished'))), 'Show done brings the finished task back');
  await page.getByRole('checkbox', { name: 'Show done' }).uncheck();
  ok(await until(async () => !(await page.locator('main').innerText()).includes(N('Finished'))), 'and hides it again');
});

await T('C. hiding an organisation never hides a clash', page, async () => {
  await page.locator(`[data-org-chip="${org2.id}"]`).click();
  ok((await lanes().count()) === 1 && (await lanes().first().innerText()).includes(N('Sujata')), 'hiding Kaizen removes its lane');
  ok((await bannerTone()) === 'bad' && (await overCells().count()) === 1, 'the clash is still shown, because the hours still have to be worked');
  ok((await page.getByText(/Hidden organisations still count/).count()) === 1, 'the page says so');
  await page.locator(`[data-org-chip="${org2.id}"]`).click();
  ok((await lanes().count()) === 2, 'showing it again restores the lane');
  await page.reload({ waitUntil: 'networkidle' }); await openMyTimeline();
  await page.locator(`[data-org-chip="${org1.id}"]`).click();
  await page.reload({ waitUntil: 'networkidle' }); await openMyTimeline();
  ok((await lanes().count()) === 1 && (await page.locator(`[data-org-chip="${org1.id}"]`).getAttribute('aria-pressed')) === 'false', 'a hidden organisation stays hidden after a reload');
  await page.locator(`[data-org-chip="${org1.id}"]`).click();
  ok((await lanes().count()) === 2, 'and can be shown again');
});

await T('D. opening a task, adding an estimate, and the clash going away', page, async () => {
  await page.locator(`[data-task-id="${clash1.id}"]`).first().click();
  await page.getByLabel('Estimate (hours)').waitFor({ timeout: 8000 });
  const assignee = await page.getByLabel('Assignee', { exact: true }).inputValue();
  ok(assignee === String(meId), 'the task opens with its real assignee (the summary row has none, the full task is fetched)', assignee);
  const est = page.getByLabel('Estimate (hours)');
  ok((await est.inputValue()) === '6', 'the estimate field shows the saved 6 hours');
  await est.fill('2'); await est.press('Enter');
  ok(await until(async () => (await bannerTone()) === 'good', 10000), 'lowering 6 hours to 2 clears the headline (2 + 6 = 8 h fits an 8 h day)');
  ok((await page.getByLabel('Estimate (hours)').count()) === 1, 'the drawer stays open while the plan redraws');
  ok((await overCells().count()) === 0, 'no overloaded day is left on the strip');
  const saved = await call('GET', `${A.url}/${clash1.id}`, tok);
  ok(saved.estimate_hours === 2, 'the estimate is saved on the server', String(saved.estimate_hours));
  await page.keyboard.press('Escape');
  ok((await page.getByLabel('Estimate (hours)').count()) === 0, 'Escape closes the drawer');
});

await T('E. the working week is the person\'s own', page, async () => {
  await weekPanel(true);
  const hours = page.getByLabel('Hours per day');
  await hours.fill('4'); await hours.press('Enter');
  ok(await until(async () => (await bannerTone()) === 'bad', 10000), 'with 4 hour days the same work is overloaded again');
  await hours.fill('8'); await hours.press('Enter');
  ok(await until(async () => (await bannerTone()) === 'good', 10000), 'back to 8 hour days the headline is clear again');
  await hours.fill('99'); await hours.press('Enter');
  ok((await hours.inputValue()) === '8', 'an impossible number of hours is refused and the old value comes back');
  // The last working day cannot be switched off: the app ignores the click, so use a plain click, not uncheck().
  for (const d of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']) await page.getByRole('checkbox', { name: d, exact: true }).uncheck();
  await page.getByRole('checkbox', { name: 'Sat', exact: true }).click();
  const checked = page.getByRole('group', { name: 'Working days' }).locator('input:checked');
  ok((await checked.count()) === 1 && await page.getByRole('checkbox', { name: 'Sat', exact: true }).isChecked(), 'at least one working day always stays on');
  for (const d of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']) await page.getByRole('checkbox', { name: d, exact: true }).check();
  ok(await until(async () => (await bannerTone()) === 'good', 10000), 'switching the week back restores the headline');
  await weekPanel(false);
});

await T('F. agenda and month views agree with the timeline', page, async () => {
  await weekPanel(true);
  const hours = page.getByLabel('Hours per day'); await hours.fill('4'); await hours.press('Enter');
  await until(async () => (await bannerTone()) === 'bad', 10000);
  await weekPanel(false);
  await page.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Agenda', exact: true }).click();
  const agendaDay = page.locator('[data-testid="my-agenda"] section[data-level="severe"], [data-testid="my-agenda"] section[data-level="over"]');
  ok(await until(async () => (await agendaDay.count()) >= 1), 'the agenda marks the overloaded day with its hours');
  ok(/of 4 h/.test(await agendaDay.first().innerText()), 'and says how many hours the day holds');
  await page.reload({ waitUntil: 'networkidle' }); await openMyTimeline();
  ok((await page.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Agenda', exact: true }).getAttribute('aria-pressed')) === 'true', 'the chosen view is remembered after a reload');
  await page.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Month', exact: true }).click();
  ok(await until(async () => (await page.locator('[data-testid="my-month"] [data-level="severe"], [data-testid="my-month"] [data-level="over"]').count()) >= 1), 'the month view outlines the overloaded day');
  await page.getByRole('button', { name: 'Show', exact: true }).first().click();
  ok((await page.getByTestId('my-month').count()) === 1, 'Show keeps the month view and moves to the clash day');
  await page.locator(`[data-testid="my-month"] [data-task-id="${clash1.id}"]`).first().click();
  ok(await until(async () => (await page.getByLabel('Estimate (hours)').count()) === 1), 'clicking a task in the month view opens it');
  await page.keyboard.press('Escape');
  // An empty month must still be navigable (the calendar once vanished, taking Previous/Today with it).
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Next month' }).click();
  ok(await until(async () => (await page.getByTestId('my-month').count()) === 1 && (await page.getByRole('button', { name: 'Previous month' }).count()) === 1), 'an empty month still shows the calendar with its buttons');
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  ok(await until(async () => (await page.locator('[data-testid="my-month"] [data-level="severe"], [data-testid="my-month"] [data-level="over"]').count()) >= 1), 'Today brings back the month with the clash');
  await page.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Timeline', exact: true }).click();
  await page.getByLabel('Range').selectOption('3m');
  ok(await until(async () => (await page.locator('[data-testid="load-strip"] [data-date]').count()) === 99), 'the 3 month range draws 99 days (1 week back, 13 weeks ahead)');
  await page.getByLabel('Range').selectOption('2w');
  ok(await until(async () => (await page.locator('[data-testid="load-strip"] [data-date]').count()) === 22), 'the 2 week range draws 22 days');
  await page.getByLabel('Range').selectOption('6w');
  await weekPanel(true);
  const h2 = page.getByLabel('Hours per day'); await h2.fill('8'); await h2.press('Enter');
  await until(async () => (await bannerTone()) === 'good', 10000);
  await weekPanel(false);
});

await T('G. offline: a failed load says so, and it recovers when the connection returns', page, async () => {
  // (Not page.route: the app's service worker answers API reads itself, so only real offline mode reaches it.)
  await ctx.setOffline(true);
  ok(await until(async () => (await page.getByTestId('offline-note').count()) === 1), 'going offline says the plan may be out of date');
  await page.getByLabel('Range').selectOption('2w'); // a window the device has never saved
  const gotAlert = await until(async () => (await page.getByRole('alert').count()) >= 1, 15000);
  ok(gotAlert, 'a load that cannot be answered shows a message', gotAlert ? '' : 'alerts=' + (await page.getByRole('alert').allInnerTexts()).join('|'));
  ok(/reach the server/i.test((await page.getByRole('alert').allInnerTexts()).join(' ')), 'in plain words');
  ok((await page.getByTestId('timeline-banner').count()) === 1, 'the last good plan stays on screen meanwhile');
  await ctx.setOffline(false);
  ok(await until(async () => (await page.getByRole('alert').count()) === 0 && (await page.getByTestId('offline-note').count()) === 0, 15000), 'coming back online refreshes the plan and clears both messages');
  await page.getByLabel('Range').selectOption('6w');
});

await T('H. a person with nothing assigned gets a clear empty page', page, async () => {
  const p2 = await ctx.newPage(); watch(p2, 'L');
  await login(p2, { email: LONELY });
  // They have no organisation yet: the first-run screen, never a broken page.
  ok((await p2.getByText(/create your first organization/i).count()) === 1, 'a person with no organisation starts on the first-run screen');
  const lonelyTok = await signIn(LONELY);
  await call('POST', '/api/orgs', lonelyTok, { name: N('Empty Org') });
  await p2.reload({ waitUntil: 'networkidle' });
  await p2.getByRole('button', { name: 'My Timeline', exact: true }).first().click();
  await p2.getByTestId('timeline-empty').waitFor({ timeout: 10000 });
  ok(/Nothing is assigned to you/.test(await p2.getByTestId('timeline-empty').innerText()), 'with an organisation but no tasks the page says nothing is assigned');
  await p2.close();
});

await T('I. on a phone the agenda is the default and the page never scrolls sideways', page, async () => {
  const { ctx: phoneCtx } = { ctx: await browser.newContext({ viewport: { width: 400, height: 800 }, colorScheme: 'light' }) };
  await phoneCtx.route(/trycloudflare\.com|github\.io|api\.github\.com/, (r) => { stats.leaks.push(r.request().url()); r.abort(); });
  const ph = await phoneCtx.newPage(); watch(ph, 'P');
  await login(ph, { email: ME, orgId: org1.id });
  await ph.getByRole('button', { name: 'My Timeline', exact: true }).first().click();
  await ph.getByTestId('timeline-banner').waitFor({ timeout: 10000 });
  ok((await ph.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Agenda', exact: true }).getAttribute('aria-pressed')) === 'true', 'a fresh phone opens the agenda');
  const sideways = () => ph.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok((await sideways()) <= 1, 'the agenda fits the screen width', String(await sideways()));
  await shot(ph, 't4-I-phone-agenda');
  await ph.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Timeline', exact: true }).click();
  await ph.getByTestId('my-timeline-scroll').waitFor();
  ok((await sideways()) <= 1, 'the timeline scrolls inside its own box, not the whole page', String(await sideways()));
  await ph.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Month', exact: true }).click();
  await ph.getByTestId('my-month').waitFor();
  ok((await sideways()) <= 1, 'the month view fits too', String(await sideways()));
  await phoneCtx.close();
});

console.log('\n--- app-wide checks');
ok(stats.leaks.length === 0, 'no request left for the live hosts', stats.leaks.slice(0, 2).join(' | '));
ok(stats.pageErrors.length === 0, 'no uncaught page errors in the whole run', stats.pageErrors.slice(0, 2).join(' | '));
const unexpected = stats.apiErrors.filter((e) => !/ -> (400|401|403|404|409|422|428|429)/.test(e));
ok(unexpected.length === 0, 'no 5xx or unexpected server errors in the whole run', unexpected.slice(0, 2).join(' | '));

summary('t4 my timeline');
await browser.close();
process.exit(stats.fail ? 1 : 0);
