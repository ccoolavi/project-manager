import { chromium } from 'playwright'
const URL = 'https://ccoolavi.github.io/project-manager/'
const SHOTS = './shots'
const stamp = Date.now()
const EMAIL = `gantt${stamp}@test.com`
const PASS = 'TestPass123'
let pass = 0, fail = 0
const ok = (c, m) => { c ? (console.log(`  PASS  ${m}`), pass++) : (console.log(`  FAIL  ${m}`), fail++) }

const browser = await chromium.launch()
const p = await (await browser.newContext()).newPage()

await p.goto(URL, { waitUntil: 'networkidle' })
await p.getByRole('link', { name: /sign up/i }).click()
await p.waitForTimeout(800)
await p.locator('input[type="text"]').first().fill('Gantt Test')
await p.locator('input[type="email"]').fill(EMAIL)
const pw = p.locator('input[type="password"]')
await pw.nth(0).fill(PASS)
await pw.nth(1).fill(PASS)
await p.getByRole('button', { name: /sign up|create|register/i }).click()
await p.waitForTimeout(4000)
await p.locator('input[placeholder*="Organization" i]').fill('Gantt Org')
await p.getByRole('button', { name: /create organization/i }).click()
await p.waitForTimeout(4000)
await p.locator('input[placeholder*="New project" i]').fill('Gantt Project')
await p.locator('input[placeholder*="New project" i]').press('Enter')
await p.waitForTimeout(4000)
await p.locator('input[placeholder*="task" i]').first().fill('Scheduled task')
await p.locator('input[placeholder*="task" i]').first().press('Enter')
await p.waitForTimeout(3000)

// Set start/due dates + priority via the detail panel so the bar has real geometry
await p.getByText('Scheduled task').click()
await p.waitForTimeout(1500)
const dateInputs = p.locator('input[type="date"]')
await dateInputs.nth(0).fill('2026-08-10')
await p.waitForTimeout(1200)
await dateInputs.nth(1).fill('2026-08-20')
await p.waitForTimeout(1200)
await p.locator('select').nth(2).selectOption('urgent')
await p.waitForTimeout(1200)
await p.getByLabel('Close', { exact: true }).click()
await p.waitForTimeout(1000)

await p.getByText(/^Timeline$/).first().click()
await p.waitForTimeout(3000)
await p.screenshot({ path: `${SHOTS}/gantt-1.png` })
const text = await p.locator('body').innerText()
ok(/Gantt Project/.test(text), 'project group label renders')
ok(await p.getByTitle('Scheduled task').isVisible(), 'task bar renders with title tooltip')

// Click the bar -> should open the Task Detail Panel
await p.getByTitle('Scheduled task').click()
await p.waitForTimeout(1500)
await p.screenshot({ path: `${SHOTS}/gantt-2-panel.png` })
ok(await p.locator('input[aria-label="Task title"]').isVisible(), 'clicking the bar opens the Task Detail Panel')

console.log(`\n=========== GANTT RESULT: ${pass} passed, ${fail} failed ===========`)
await browser.close()
process.exit(fail ? 1 : 0)
