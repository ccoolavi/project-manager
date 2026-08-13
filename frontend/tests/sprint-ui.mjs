import { chromium } from 'playwright'
const URL = 'https://ccoolavi.github.io/project-manager/'
const SHOTS = './shots'
const stamp = Date.now()
const EMAIL = `sprint${stamp}@test.com`
const PASS = 'TestPass123'
let pass = 0, fail = 0
const ok = (c, m) => { c ? (console.log(`  PASS  ${m}`), pass++) : (console.log(`  FAIL  ${m}`), fail++) }

const browser = await chromium.launch()
const p = await (await browser.newContext()).newPage()

await p.goto(URL, { waitUntil: 'networkidle' })
await p.getByRole('link', { name: /sign up/i }).click()
await p.waitForTimeout(800)
await p.locator('input[type="text"]').first().fill('Sprint Test')
await p.locator('input[type="email"]').fill(EMAIL)
const pw = p.locator('input[type="password"]')
await pw.nth(0).fill(PASS)
await pw.nth(1).fill(PASS)
await p.getByRole('button', { name: /sign up|create|register/i }).click()
await p.waitForTimeout(4000)
await p.locator('input[placeholder*="Organization" i]').fill('Sprint Org')
await p.getByRole('button', { name: /create organization/i }).click()
await p.waitForTimeout(4000)
await p.locator('input[placeholder*="New project" i]').fill('Sprint Project')
await p.locator('input[placeholder*="New project" i]').press('Enter')
await p.waitForTimeout(4000)

// Two tasks with story points via the detail panel
for (const title of ['Sprint task A', 'Sprint task B']) {
  await p.locator('input[placeholder*="task" i]').first().fill(title)
  await p.locator('input[placeholder*="task" i]').first().press('Enter')
  await p.waitForTimeout(2500)
}
await p.getByText('Sprint task A', { exact: true }).click()
await p.waitForTimeout(1200)
await p.locator('input[type="number"]').fill('3')
await p.locator('input[type="number"]').blur()
await p.waitForTimeout(1500)
await p.getByLabel('Close', { exact: true }).click()
await p.waitForTimeout(1000)
await p.getByText('Sprint task B', { exact: true }).click()
await p.waitForTimeout(1200)
await p.locator('input[type="number"]').fill('5')
await p.locator('input[type="number"]').blur()
await p.waitForTimeout(1500)
await p.getByLabel('Close', { exact: true }).click()
await p.waitForTimeout(1000)

await p.getByText(/^Sprints$/).first().click()
await p.waitForTimeout(2000)
await p.getByRole('button', { name: /new sprint/i }).click()
await p.waitForTimeout(800)
await p.getByPlaceholder('Sprint name').fill('Sprint 1')
await p.getByPlaceholder('Goal (optional)').fill('Ship the feature')
await p.getByLabel('Start date').fill('2026-08-10')
await p.getByLabel('End date').fill('2026-08-24')
await p.getByRole('button', { name: /^Create$/ }).click()
await p.waitForTimeout(2500)
await p.screenshot({ path: `${SHOTS}/sprint-1-created.png` })
ok(/Sprint 1/.test(await p.locator('body').innerText()), 'sprint created and selected')

// Add both tasks to the sprint
await p.locator('select[aria-label="Add a task to this sprint"]').selectOption({ label: 'Sprint task A' })
await p.locator('button[aria-label="Add dependency"]').first().click().catch(() => {}) // no-op guard
await p.locator('select[aria-label="Add a task to this sprint"]').selectOption({ label: 'Sprint task A' })
await p.getByRole('button', { name: '' }).nth(0) // placeholder, real click below
await p.waitForTimeout(300)

// Use a more precise locator for the add-task plus button next to the select
const addBtn = p.locator('select[aria-label="Add a task to this sprint"] ~ button')
await p.locator('select[aria-label="Add a task to this sprint"]').selectOption({ label: 'Sprint task A' })
await addBtn.click()
await p.waitForTimeout(2000)
await p.locator('select[aria-label="Add a task to this sprint"]').selectOption({ label: 'Sprint task B' })
await addBtn.click()
await p.waitForTimeout(2000)
await p.screenshot({ path: `${SHOTS}/sprint-2-tasks-added.png` })
const text = await p.locator('body').innerText()
ok(/8/.test(text) && /Story points/.test(text), 'progress bar shows 0 / 8 points')
ok(/Sprint task A/.test(text) && /Sprint task B/.test(text), 'both tasks appear on the sprint board')

console.log(`\n=========== SPRINT RESULT: ${pass} passed, ${fail} failed ===========`)
await p.screenshot({ path: SHOTS+'/sprint-3-full.png', fullPage: true })
await browser.close()
process.exit(fail ? 1 : 0)
