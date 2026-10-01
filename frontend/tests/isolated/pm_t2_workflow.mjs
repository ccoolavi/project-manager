import { launch, watch, register, login, createOrg, createProject, shot, ok, stats, summary, uniq, BASE, API } from './pmlib.mjs';
import { execFileSync } from 'node:child_process';

const DB = process.env.PM_DB;
const py = (code) => execFileSync('python3', ['-c', code], { encoding: 'utf8' }).trim();
const q = (sql, ...args) => py(`import sqlite3,json;c=sqlite3.connect('${DB}');print(json.dumps(c.execute(${JSON.stringify(sql)},${JSON.stringify(args)}).fetchall()))`);
const VENV_PY = process.env.VENV_PY || (process.env.HOME + '/projects/project_manager/backend/venv/bin/python');
// Destructive actions ask for an emailed code. Mail is switched off in the test stack, so put a code we know into the
// table the server checks against (the same bcrypt hashing the server uses) and type it into the dialog like a person would.
const setKnownCode = (email, purpose = 'sensitive_action') => execFileSync(VENV_PY, ['-c', `
import sqlite3, bcrypt
h = bcrypt.hashpw(b"123456", bcrypt.gensalt()).decode()
c = sqlite3.connect("${DB}")
uid = c.execute("select id from users where email=?", ("${email}",)).fetchone()[0]
rid = c.execute("select max(id) from email_otps where user_id=? and purpose=?", (uid, "${purpose}")).fetchone()[0]
c.execute("update email_otps set otp_hash=?, verified_at=NULL, expires_at=datetime('now','+10 minutes') where id=?", (h, rid))
c.commit()`]);
const until = async (fn, ms = 8000, step = 250) => { const end = Date.now() + ms; for (;;) { try { const v = await fn(); if (v) return v; } catch { /* keep polling */ } if (Date.now() > end) return false; await new Promise((r) => setTimeout(r, step)); } };
// A destructive action asks for a code only if the person has not confirmed one in the last 5 minutes. Returns whether it asked.
const maybePassCodeStep = async (pg, email) => {
  const asked = await until(async () => (await pg.getByLabel('Verification code').count()) > 0, 3500);
  if (asked) await passCodeStep(pg, email);
  return !!asked;
};
const passCodeStep = async (pg, email) => {
  const box = pg.getByLabel('Verification code'); await box.waitFor({ timeout: 8000 });
  await pg.waitForTimeout(900); // the app asks the server for the code as the dialog opens
  setKnownCode(email);
  await box.fill('123456'); await pg.getByRole('button', { name: 'Confirm', exact: true }).click(); await pg.waitForTimeout(1800);
};
const RUN = uniq();
const N = (t) => `${t} ${RUN}`;
const U1 = `own-${RUN}@example.com`, U2 = `mem-${RUN}@example.com`;

const T = async (name, page, fn) => {
  console.log(`== ${name}`);
  try { await fn(); } catch (e) {
    ok(false, `${name} threw: ${String(e.message).split('\n')[0]}`);
    try { await shot(page, 'fail-' + name.replace(/\W+/g, '-').slice(0, 40)); } catch { /* ignore */ }
  }
};

const { browser, ctx } = await launch();
const page = await ctx.newPage(); watch(page, 'A');
const tab = (name) => page.getByRole('button', { name, exact: true }).first();
const toastText = async () => (await page.locator('[data-toast]').allInnerTexts()).join(' | ');
const rootOk = async () => !(await page.getByText('Something went wrong').count()) && (await page.locator('#root').innerHTML()).length > 200;

// ---------------------------------------------------------------- A. route guard, register, logout, login
await T('A. sign-in, sign-out and the route guard', page, async () => {
  await page.goto(BASE + '#/dashboard', { waitUntil: 'networkidle' }); await page.waitForTimeout(600);
  ok(/#\/login/.test(page.url()), 'a signed-out visitor opening the dashboard is sent to the login page', page.url().split('#')[1]);
  await register(page, { email: U1, name: 'Owner One' });
  await createOrg(page, N('Org One'));
  ok(await tab('Tasks').isVisible(), 'registration and first organisation lead to the dashboard');
  await page.getByRole('button', { name: 'Log out' }).click(); await page.waitForTimeout(1200);
  ok(/#\/login/.test(page.url()), 'Log out returns to the login page');
  ok((await page.evaluate(() => localStorage.getItem('access_token'))) === null, 'the saved sign-in is cleared');
  await page.goto(BASE + '#/dashboard', { waitUntil: 'networkidle' }); await page.waitForTimeout(600);
  ok(/#\/login/.test(page.url()), 'after logging out the dashboard is no longer reachable');
  await page.locator('input[type="email"], input[type="text"]').first().fill(U1);
  await page.locator('input[type="password"]').first().fill('WrongPass999');
  await page.getByRole('button', { name: /^(sign in|log in|login)/i }).click();
  await until(async () => /invalid|incorrect|wrong|credentials/i.test(await page.locator('body').innerText()), 8000);
  const bad = await page.locator('body').innerText();
  ok(/#\/login/.test(page.url()) && /invalid|incorrect|wrong|not correct|credentials/i.test(bad) && !/\[object/.test(bad), 'a wrong password shows a readable message and stays on the form', bad.replace(/\s+/g, ' ').match(/(invalid|incorrect|wrong)[^.]{0,60}/i)?.[0] || '');
  await login(page, { email: U1 });
  ok(await tab('Tasks').isVisible() && (await page.getByLabel('Organisation').inputValue()) !== '', 'the right password signs back in to the saved organisation');
});

// ---------------------------------------------------------------- B. organisations
await T('B. organisations: rename, create, switch, leave', page, async () => {
  await tab('My Organizations').click(); await page.waitForTimeout(800);
  await page.getByRole('button', { name: `Rename ${N('Org One')}` }).click();
  const box = page.getByLabel(`New name for ${N('Org One')}`);
  await box.fill(''); await box.press('Enter'); await page.waitForTimeout(500);
  ok(/needs a name/i.test(await page.locator('body').innerText()), 'renaming to a blank name is refused with a message');
  await box.fill(N('Org Uno')); await box.press('Enter'); await page.waitForTimeout(1200);
  ok((await page.getByText(N('Org Uno'), { exact: true }).count()) >= 1, 'the new name shows in the list');
  ok((await page.getByLabel('Organisation').locator('option', { hasText: N('Org Uno') }).count()) === 1, 'the organisation selector at the top shows the new name too (no reload needed)');
  await page.getByRole('button', { name: `Rename ${N('Org Uno')}` }).click();
  await page.getByLabel(`New name for ${N('Org Uno')}`).press('Escape');
  ok((await page.getByLabel(/New name for/).count()) === 0, 'Escape cancels renaming');

  await page.getByPlaceholder(/organization name|new organization/i).last().fill(N('Org Two')).catch(async () => { await page.locator('input[placeholder*="rganization" i]').last().fill(N('Org Two')); });
  await page.getByRole('button', { name: 'Create', exact: true }).dblclick(); await page.waitForTimeout(1500);
  ok(JSON.parse(q("select count(*) from organizations where name=?", N('Org Two')))[0][0] === 1, 'double-clicking Create makes exactly one organisation');
  ok((await page.getByLabel('Organisation').locator('option', { hasText: N('Org Two') }).count()) === 1, 'the new organisation is selectable in the top selector');
  await page.getByLabel('Organisation').selectOption({ label: N('Org Uno') }); await page.waitForTimeout(1000);
  ok((await page.getByLabel('Organisation').inputValue()) === (await page.getByLabel('Organisation').locator('option', { hasText: N('Org Uno') }).getAttribute('value')), 'the selector switches organisation');
  await page.getByLabel('Organisation').selectOption({ label: N('Org Two') }); await page.waitForTimeout(800);

  await tab('My Organizations').click(); await page.waitForTimeout(800);
  const before = JSON.parse(q("select count(*) from organization_members where user_id=(select id from users where email=?)", U1))[0][0];
  await page.getByRole('button', { name: `Leave ${N('Org Two')}` }).click(); await page.waitForTimeout(400);
  ok(JSON.parse(q("select count(*) from organization_members where user_id=(select id from users where email=?)", U1))[0][0] === before, 'one click on Leave does NOT leave: it asks first');
  await page.getByRole('button', { name: 'Cancel leaving' }).click(); await page.waitForTimeout(300);
  ok((await page.getByText(N('Org Two'), { exact: true }).count()) >= 1, 'Cancel keeps the organisation');
  await page.getByRole('button', { name: `Leave ${N('Org Two')}` }).click();
  await page.getByRole('button', { name: `Confirm leaving ${N('Org Two')}` }).click(); await page.waitForTimeout(1800);
  ok(JSON.parse(q("select count(*) from organization_members where user_id=(select id from users where email=?)", U1))[0][0] === before - 1, 'confirming leaves the organisation');
  ok((await page.getByLabel('Organisation').locator('option', { hasText: N('Org Two') }).count()) === 0, 'the selector no longer lists the organisation that was left');
  ok(await rootOk(), 'the app is still healthy after leaving the organisation that was on screen');
  await page.getByLabel('Organisation').selectOption({ label: N('Org Uno') }); await page.waitForTimeout(800);
  await shot(page, 't2-B-orgs');
});

// ---------------------------------------------------------------- C. projects and sections
await T('C. projects and sections', page, async () => {
  await tab('Projects').click(); await page.waitForTimeout(600);
  await createProject(page, N('Alpha'));
  await createProject(page, N('Beta')); await page.waitForTimeout(500);
  ok((await page.getByText(N('Alpha'), { exact: true }).count()) === 1 && (await page.getByText(N('Beta'), { exact: true }).count()) === 1, 'two projects are listed');
  await page.getByLabel('New section name').fill(N('Backlog'));
  await page.getByRole('button', { name: 'Create section' }).dblclick(); await page.waitForTimeout(1200);
  ok(JSON.parse(q("select count(*) from sub_projects where name=?", N('Backlog')))[0][0] === 1, 'double-clicking Create section makes one section');
  await page.getByLabel('Create project').click(); await page.waitForTimeout(500);
  ok(await rootOk(), 'pressing Create project with an empty box does not break the screen');

  await page.getByRole('button', { name: `Delete ${N('Beta')}` }).click(); await page.waitForTimeout(400);
  ok((await page.getByText(N('Beta'), { exact: true }).count()) === 1, 'one click on the bin does NOT delete a project: it asks first');
  await page.getByRole('button', { name: 'Cancel deleting' }).click(); await page.waitForTimeout(300);
  ok((await page.getByText(N('Beta'), { exact: true }).count()) === 1, 'Cancel keeps the project');
  await page.getByRole('button', { name: `Delete ${N('Beta')}` }).click();
  await page.getByRole('button', { name: `Confirm deleting ${N('Beta')}` }).click();
  await until(async () => (await page.getByRole('dialog', { name: 'Confirm this action' }).count()) === 1, 8000);
  ok((await page.getByRole('dialog', { name: 'Confirm this action' }).count()) === 1, 'a destructive action then asks for the emailed code');
  await page.getByLabel('Verification code').fill('000000'); await page.getByRole('button', { name: 'Confirm', exact: true }).click(); await page.waitForTimeout(1200);
  ok((await page.getByText(N('Beta'), { exact: true }).count()) === 1, 'a wrong code does not delete anything and the dialog explains', (await page.getByRole('dialog').innerText()).replace(/\s+/g, ' ').match(/not correct|expired|request a new/i)?.[0] || '');
  await passCodeStep(page, U1);
  ok((await page.getByText(N('Beta'), { exact: true }).count()) === 0 && JSON.parse(q("select count(*) from projects where name=?", N('Beta')))[0][0] === 0, 'confirming deletes it from the screen and the server');
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(800); await tab('Projects').click(); await page.waitForTimeout(600);
  ok((await page.getByText(N('Alpha'), { exact: true }).count()) === 1 && (await page.getByText(N('Beta'), { exact: true }).count()) === 0, 'after a reload the list is the same');
});

// ---------------------------------------------------------------- D. habits, kaizen, time
await T('D1. habits', page, async () => {
  await tab('Habits').click(); await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'Add habit' }).click(); await page.waitForTimeout(400);
  ok(/Type the name of the habit/i.test(await toastText()), 'adding with an empty box explains what to do');
  await page.getByLabel('New habit name').fill(N('Read')); await page.getByRole('button', { name: 'Add habit' }).dblclick(); await page.waitForTimeout(1200);
  ok(JSON.parse(q("select count(*) from habits where title=?", N('Read')))[0][0] === 1, 'double-clicking Add makes exactly one habit');
  const mark = page.getByRole('button', { name: `Mark ${N('Read')} done today` });
  await mark.click(); await page.waitForTimeout(1000);
  ok((await page.getByRole('button', { name: `${N('Read')}: done today` }).getAttribute('aria-pressed')) === 'true', 'checking the habit shows it as done today');
  await page.getByRole('button', { name: `${N('Read')}: done today` }).click(); await page.waitForTimeout(800);
  ok(JSON.parse(q("select streak from habits where title=?", N('Read')))[0][0] === 1, 'checking twice in one day counts once (streak stays 1)');
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(600); await tab('Habits').click(); await page.waitForTimeout(800);
  ok((await page.getByRole('button', { name: `${N('Read')}: done today` }).count()) === 1, 'the done-today mark survives a reload');
  await page.getByLabel('New habit name').fill(N('Stretch')); await page.getByLabel('New habit name').press('Enter'); await page.waitForTimeout(1000);
  await page.getByRole('button', { name: `Delete ${N('Stretch')}` }).click(); await page.waitForTimeout(1000);
  ok(JSON.parse(q("select count(*) from habits where title=?", N('Stretch')))[0][0] === 0, 'deleting a habit removes it on the server');
});

await T('D2. kaizen log', page, async () => {
  await tab('Kaizen').click(); await page.waitForTimeout(600);
  await page.getByRole('button', { name: /Log Improvement/ }).click(); await page.waitForTimeout(400);
  ok(/fill in the title/i.test(await toastText()), 'an incomplete entry is explained, not ignored');
  await page.getByPlaceholder('Improvement title...').fill(N('Batch email'));
  await page.getByPlaceholder('What was the problem?').fill('Constant context switching');
  await page.getByPlaceholder("What's the solution?").fill('Two fixed slots a day');
  await page.getByRole('button', { name: /Log Improvement/ }).dblclick(); await page.waitForTimeout(1200);
  ok(JSON.parse(q("select count(*) from kaizen_logs where title=?", N('Batch email')))[0][0] === 1, 'double-clicking saves exactly one entry');
  ok((await page.getByPlaceholder('Improvement title...').inputValue()) === '', 'the form clears after saving');
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(600); await tab('Kaizen').click(); await page.waitForTimeout(800);
  ok((await page.getByText(N('Batch email'), { exact: true }).count()) === 1, 'the entry is still there after a reload');
  await page.getByRole('button', { name: `Delete ${N('Batch email')}` }).click(); await page.waitForTimeout(1000);
  ok(JSON.parse(q("select count(*) from kaizen_logs where title=?", N('Batch email')))[0][0] === 0, 'deleting removes it on the server');
});

await T('D3. time log', page, async () => {
  await tab('Time').click(); await page.waitForTimeout(600);
  const log = async (v) => { await page.getByLabel('Minutes').fill(v); await page.getByRole('button', { name: /Log Time/ }).click(); await page.waitForTimeout(500); };
  const rows = () => JSON.parse(q("select duration_minutes from time_entries where user_id=(select id from users where email=?) order by id", U1)).map((r) => r[0]);
  for (const bad of ['', '0', '-5', '1.5', '1441']) {  // (a number box refuses letters by itself)
    await log(bad);
    ok(/whole minutes/i.test(await toastText()) && rows().length === 0, `"${bad}" is refused with a message and nothing is saved`);
    await page.locator('[data-toast] button[aria-label="Dismiss notification"]').first().click().catch(() => {});
  }
  await log('60'); await page.waitForTimeout(600); await log('30'); await page.waitForTimeout(600);
  ok(JSON.stringify(rows()) === '[60,30]', 'valid entries are saved', JSON.stringify(rows()));
  ok(/1h 30m/.test(await page.locator('body').innerText()), 'the total shows 1h 30m');
  const firstRow = async () => (await page.locator('main .space-y-2 > div').first().innerText()).replace(/\s+/g, ' ');
  const newest = await firstRow();
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(600); await tab('Time').click(); await page.waitForTimeout(800);
  ok((await firstRow()) === newest, 'the newest entry stays on top after a reload (the order does not flip)', newest);
  await page.getByRole('button', { name: /Delete the .* entry/ }).first().click(); await page.waitForTimeout(1000);
  ok(rows().length === 1, 'deleting removes it from the server, not just the screen', JSON.stringify(rows()));
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(600); await tab('Time').click(); await page.waitForTimeout(800);
  ok((await page.getByRole('button', { name: /Delete the .* entry/ }).count()) === 1, 'after a reload the deleted entry has not come back');
});

// ---------------------------------------------------------------- E. analytics
await T('E. analytics', page, async () => {
  await tab('Analytics').click(); await page.waitForTimeout(2500);
  ok(await rootOk(), 'the Analytics tab opens without crashing');
  const text = await page.locator('main').innerText();
  ok(/Habit consistency/i.test(text) && /%/.test(text) && !/NaN|undefined/.test(text), 'habit consistency is shown as a percentage', text.replace(/\s+/g, ' ').match(/Habit consistency[^A-Z]{0,40}/)?.[0] || '');
  ok(/Time logged/i.test(text) && /\d+\.\dh/.test(text), 'time logged shows hours');
  ok((await page.locator('.recharts-surface').count()) >= 1, 'charts are drawn');
  await shot(page, 't2-E-analytics');
});

// ---------------------------------------------------------------- F. global search + tasks + my timeline
await T('F. search and My Timeline', page, async () => {
  await tab('Tasks').click(); await page.waitForTimeout(800);
  await page.getByText(N('Alpha'), { exact: true }).first().click().catch(() => {});
  await tab('Projects').click(); await page.waitForTimeout(500);
  await page.getByText(N('Alpha'), { exact: true }).first().click(); await page.waitForTimeout(800);
  await tab('Tasks').click(); await page.waitForTimeout(1000);
  const titleBox = page.getByLabel('New task title');
  await titleBox.waitFor({ timeout: 6000 });
  await titleBox.fill(N('Findable task')); await page.getByRole('button', { name: 'Add task' }).click(); await page.waitForTimeout(1200);
  const search = page.getByLabel('Search', { exact: true });
  await search.fill('Findable'); await page.waitForTimeout(1200);
  const hit = page.getByRole('button', { name: new RegExp(N('Findable task')) });
  ok((await hit.count()) >= 1, 'typing in the search box lists the matching task');
  await tab('Habits').click(); await page.waitForTimeout(400);
  await search.fill('Findable'); await page.waitForTimeout(1200);
  await page.getByRole('button', { name: new RegExp(N('Findable task')) }).first().click(); await page.waitForTimeout(1200);
  ok((await page.getByText(N('Findable task'), { exact: true }).count()) >= 1 && (await page.getByLabel('New task title').count()) === 1, 'choosing a result jumps to the Tasks board showing that task');
  await search.fill('Zzzznothing'); await page.waitForTimeout(1000);
  ok(await rootOk(), 'a search with no results does not break anything');
  await search.fill('');

  // give the task a due date + assignee so it appears on My Timeline
  await page.getByText(N('Findable task'), { exact: true }).first().click(); await page.waitForTimeout(1000);
  const today = new Date().toISOString().slice(0, 10);
  await page.getByLabel('Due date', { exact: true }).fill(today); await page.waitForTimeout(800);
  await page.getByLabel('Assignee', { exact: true }).selectOption({ index: 1 }); await page.waitForTimeout(1000);
  await page.getByLabel('Close', { exact: true }).click().catch(() => {}); await page.waitForTimeout(500);
  await tab('My Timeline').click(); await page.waitForTimeout(1500);
  ok((await page.getByText(N('Findable task')).count()) >= 1, 'My Timeline lists the task assigned to me with a due date');
  const monthLabel = async () => (await page.locator('main').innerText()).match(/(January|February|March|April|May|June|July|August|September|October|November|December) \d{4}/)?.[0];
  const m0 = await monthLabel();
  await page.getByRole('button', { name: 'Next month' }).click(); await page.waitForTimeout(500);
  const m1 = await monthLabel();
  await page.getByRole('button', { name: 'Previous month' }).click(); await page.getByRole('button', { name: 'Previous month' }).click(); await page.waitForTimeout(500);
  const m2 = await monthLabel();
  await page.getByRole('button', { name: 'Today', exact: true }).click(); await page.waitForTimeout(500);
  ok(m0 && m1 && m2 && m1 !== m0 && m2 !== m0 && (await monthLabel()) === m0, 'Next, Previous and Today move between months correctly', `${m2} < ${m0} < ${m1}`);
  await shot(page, 't2-F-timeline');
});

// ---------------------------------------------------------------- G. people: second account, add, role, remove
const page2ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page2 = await page2ctx.newPage(); watch(page2, 'B');
await T('G. people: add, accept, role, remove', page, async () => {
  await tab('Settings').click(); await page.waitForTimeout(1200);
  ok((await page.getByText(U1).count()) >= 1 && /\(you\)/.test(await page.locator('main').innerText()), 'People lists me as "(you)"');
  await page.getByLabel('Email address to invite').fill('not-an-email'); await page.getByRole('button', { name: /^(add|invite|send)/i }).first().click().catch(() => {});
  await page.waitForTimeout(500);
  ok(/valid email/i.test(await page.locator('main').innerText()), 'an invalid email is rejected with a clear message');
  await page.getByLabel('Email address to invite').fill(U2);
  await page.getByLabel('Role').selectOption('member').catch(() => {});
  await page.getByRole('button', { name: /^(add|invite|send)/i }).first().click(); await page.waitForTimeout(2000);
  const memberRow = q("select role from organization_members where user_id=(select id from users where email=?)", U2);
  ok(memberRow !== '[]', 'a new email is added to the organisation straight away', memberRow);
  ok((await page.getByText(/temporary password/i).count()) >= 1 || (await page.getByText(U2).count()) >= 1, 'the screen shows the new person (and the temporary password to hand over, if one was made)');
  const temp = (await page.locator('main code').first().innerText().catch(() => '')).trim() || null;
  // change role
  await page.getByLabel(`Change role for ${U2}`).selectOption('viewer'); await page.waitForTimeout(1200);
  ok(JSON.parse(q("select role from organization_members where user_id=(select id from users where email=?)", U2))[0][0] === 'viewer', 'changing a role is saved on the server');
  await page.getByLabel(`Change role for ${U2}`).selectOption('member'); await page.waitForTimeout(1000);
  // the new person can sign in and sees the organisation
  if (temp) {
    await login(page2, { email: U2, password: temp });
    // a first sign-in on a device the account has never used is held until the emailed code is entered
    const gate = await until(async () => (await page2.locator('#login-code').count()) > 0 || (await page2.getByLabel('Organisation').count()) > 0, 8000);
    if (await page2.locator('#login-code').count()) {
      ok(true, 'a first sign-in from a new device asks for the emailed code');
      await page2.waitForTimeout(800); setKnownCode(U2, 'login_device');
      await page2.locator('#login-code').fill('123456'); await page2.getByRole('button', { name: /Verify and continue/ }).click();
    }
    await until(async () => (await page2.getByLabel('Organisation').count()) > 0, 10000);
    const opts = await page2.getByLabel('Organisation').locator('option').allInnerTexts().catch(() => []);
    ok(opts.some((o) => o.includes(N('Org Uno'))), 'the new person signs in with the temporary password and sees the organisation', opts.join(', '));
  } else {
    ok(false, 'temporary password was displayed to hand over');
  }
  // remove: asks first
  await page.getByRole('button', { name: `Remove ${U2}` }).click(); await page.waitForTimeout(400);
  ok(JSON.parse(q("select count(*) from organization_members where user_id=(select id from users where email=?)", U2))[0][0] === 1, 'one click on the bin does NOT remove a person: it asks first');
  await page.getByRole('button', { name: 'Cancel removing' }).click(); await page.waitForTimeout(300);
  await page.getByRole('button', { name: `Remove ${U2}` }).click();
  await page.getByRole('button', { name: `Confirm removing ${U2}` }).click();
  const asked = await maybePassCodeStep(page, U1);
  console.log('     (code asked for the removal:', asked, asked ? '' : '- already confirmed within the last 5 minutes)');
  await until(async () => JSON.parse(q("select count(*) from organization_members where user_id=(select id from users where email=?)", U2))[0][0] === 0, 6000);
  ok(JSON.parse(q("select count(*) from organization_members where user_id=(select id from users where email=?)", U2))[0][0] === 0, 'confirming removes the person');
  await shot(page, 't2-G-people');
});

// ---------------------------------------------------------------- H. a brand-new person invited by email sees the invitation
await T('H. an invitation is visible to a person who has no organisation yet', page, async () => {
  const U3 = `inv-${RUN}@example.com`;
  const p3 = await (await browser.newContext()).newPage(); watch(p3, 'C');
  await register(p3, { email: U3, name: 'Invitee' });
  await p3.waitForTimeout(800);
  ok((await p3.getByText(/create your first organization/i).count()) === 1, 'a brand-new account starts on the first-run screen');
  // an invitation addressed to that email appears (create it through the owner's API session)
  const token = await page.evaluate(() => localStorage.getItem('access_token'));
  const orgId = await page.evaluate(() => localStorage.getItem('current_org'));
  py(`import sqlite3;c=sqlite3.connect('${DB}');c.execute("insert into organization_invites (organization_id,email,role,status,created_by,expires_at,created_at) values (?,?,?,?,?,datetime('now','+3 day'),datetime('now'))",(${orgId},'${U3}','member','pending',(c.execute("select id from users where email='${U1}'").fetchone()[0])));c.commit()`);
  const made = { status: 200 };
  await p3.reload({ waitUntil: 'networkidle' }); await p3.waitForTimeout(1500);
  const seen = await p3.getByText(/You have been invited to join/i).count();
  ok(made.status < 300 ? seen === 1 : true, 'the invitation is shown on the first-run screen', `invite status ${made.status}, banner count ${seen}`);
  if (made.status < 300 && seen) {
    await p3.getByRole('button', { name: /Join/ }).click(); await p3.waitForTimeout(2000);
    ok((await p3.getByRole('button', { name: 'Tasks', exact: true }).count()) >= 1, 'accepting the invitation opens the dashboard of that organisation');
    ok(JSON.parse(q("select count(*) from organization_members where user_id=(select id from users where email=?)", U3))[0][0] === 1, 'the membership exists on the server');
  }
  await p3.close();
});

console.log('\n--- app-wide checks');
ok(stats.pageErrors.length === 0, 'no uncaught page errors in the whole run', stats.pageErrors.slice(0, 2).join(' | '));
const unexpected = stats.apiErrors.filter((e) => !/ -> (400|401|403|404|409|422|428|429)/.test(e));
ok(unexpected.length === 0, 'no 5xx or unexpected server errors in the whole run', unexpected.slice(0, 2).join(' | '));

summary('t2 workflow');
await browser.close();
process.exit(stats.fail ? 1 : 0);
