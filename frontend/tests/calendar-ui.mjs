import { chromium } from 'playwright'
const URL = 'https://ccoolavi.github.io/project-manager/'
const SHOTS = './shots'
const stamp = Date.now()
const EMAIL = `cal${stamp}@test.com`
const PASS = 'TestPass123'
let pass = 0, fail = 0
const ok = (c, m) => { c ? (console.log(`  PASS  ${m}`), pass++) : (console.log(`  FAIL  ${m}`), fail++) }

const browser = await chromium.launch()
const p = await (await browser.newContext()).newPage()

await p.goto(URL, { waitUntil: 'networkidle' })
await p.getByRole('link', { name: /sign up/i }).click()
await p.waitForTimeout(800)
await p.locator('input[type="text"]').first().fill('Calendar Test')
await p.locator('input[type="email"]').fill(EMAIL)
const pw = p.locator('input[type="password"]')
await pw.nth(0).fill(PASS)
await pw.nth(1).fill(PASS)
await p.getByRole('button', { name: /sign up|create|register/i }).click()
await p.waitForTimeout(4000)
await p.locator('input[placeholder*="Organization" i]').fill('Calendar Org')
await p.getByRole('button', { name: /create organization/i }).click()
await p.waitForTimeout(4000)
await p.locator('input[placeholder*="New project" i]').fill('Calendar Project')
await p.locator('input[placeholder*="New project" i]').press('Enter')
await p.waitForTimeout(4000)
await p.locator('input[placeholder*="task" i]').first().fill('Due this month')
await p.locator('input[placeholder*="task" i]').first().press('Enter')
await p.waitForTimeout(2500)

// Give it a due date today (so it's guaranteed visible in the current month view)
const today = new Date().toISOString().slice(0, 10)
await p.getByText('Due this month', { exact: true }).click()
await p.waitForTimeout(1200)
await p.locator('input[type="date"]').nth(1).fill(today)
await p.waitForTimeout(1500)
await p.getByLabel('Close', { exact: true }).click()
await p.waitForTimeout(1000)

await p.getByText(/^Calendar$/).first().click()
await p.waitForTimeout(3000)
await p.screenshot({ path: `${SHOTS}/calendar-1.png` })
ok(await p.getByTitle('Due this month').isVisible(), 'task chip renders on its due date')

await p.getByTitle('Due this month').click()
await p.waitForTimeout(1500)
ok(await p.locator('input[aria-label="Task title"]').isVisible(), 'clicking a chip opens the Task Detail Panel')
await p.getByLabel('Close', { exact: true }).click()
await p.waitForTimeout(800)

// Month navigation
const monthBefore = (await p.locator('h2').filter({ hasText: '2026' }).innerText())
await p.getByLabel('Next month').click()
await p.waitForTimeout(1000)
const monthAfter = (await p.locator('h2').filter({ hasText: '2026' }).innerText())
ok(monthBefore !== monthAfter, `month navigation works (${monthBefore} -> ${monthAfter})`)
await p.getByRole('button', { name: /^Today$/ }).click()
await p.waitForTimeout(1000)
const monthReset = (await p.locator('h2').filter({ hasText: '2026' }).innerText())
ok(monthReset === monthBefore, 'Today button returns to the current month')

console.log(`\n=========== CALENDAR RESULT: ${pass} passed, ${fail} failed ===========`)
await browser.close()
process.exit(fail ? 1 : 0)
