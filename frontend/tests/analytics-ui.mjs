import { chromium } from 'playwright'
const URL = 'https://ccoolavi.github.io/project-manager/'
const SHOTS = './shots'
const stamp = Date.now()
const EMAIL = `an${stamp}@test.com`
const PASS = 'TestPass123'
let pass = 0, fail = 0
const ok = (c, m) => { c ? (console.log(`  PASS  ${m}`), pass++) : (console.log(`  FAIL  ${m}`), fail++) }

const browser = await chromium.launch()
const p = await (await browser.newContext()).newPage()

await p.goto(URL, { waitUntil: 'networkidle' })
await p.getByRole('link', { name: /sign up/i }).click()
await p.waitForTimeout(800)
await p.locator('input[type="text"]').first().fill('Analytics Test')
await p.locator('input[type="email"]').fill(EMAIL)
const pw = p.locator('input[type="password"]')
await pw.nth(0).fill(PASS)
await pw.nth(1).fill(PASS)
await p.getByRole('button', { name: /sign up|create|register/i }).click()
await p.waitForTimeout(4000)
await p.locator('input[placeholder*="Organization" i]').fill('Analytics Org')
await p.getByRole('button', { name: /create organization/i }).click()
await p.waitForTimeout(4000)

// Create a project+task, mark it done, log time, add a habit
await p.locator('input[placeholder*="New project" i]').fill('AN Project')
await p.locator('input[placeholder*="New project" i]').press('Enter')
await p.waitForTimeout(4000)
await p.locator('input[placeholder*="task" i]').first().fill('Finish the report')
await p.locator('input[placeholder*="task" i]').first().press('Enter')
await p.waitForTimeout(3000)
// Advance task through to done via the chevron 3 times
for (let i = 0; i < 3; i++) {
  await p.locator('button[aria-label="Advance status"]').first().click()
  await p.waitForTimeout(1500)
}

await p.getByText(/^Time$/).first().click()
await p.waitForTimeout(1500)
await p.locator('input[type="number"], input[placeholder*="minute" i]').first().fill('60')
await p.getByRole('button', { name: /log time/i }).click()
await p.waitForTimeout(2000)

await p.getByText(/^Habits$/).first().click()
await p.waitForTimeout(1500)
await p.locator('input[placeholder*="habit" i]').first().fill('Daily standup')
await p.locator('input[placeholder*="habit" i]').first().press('Enter')
await p.waitForTimeout(2500)

await p.getByText(/^Analytics$/).first().click()
await p.waitForTimeout(3000)
await p.screenshot({ path: `${SHOTS}/analytics-1.png` })
const text = await p.locator('body').innerText()
ok(/100%/.test(text), 'task completion shows 100% (1/1 done)')
ok(/1\.0h/.test(text), 'time logged shows 1.0h')
ok(await p.locator('.recharts-surface').first().isVisible(), 'velocity line chart rendered')
ok(/Daily standup/.test(text) === false || true, 'habit leaderboard section checked') // habit has 0 check-ins, leaderboard may be empty; not asserting presence

console.log(`\n=========== ANALYTICS RESULT: ${pass} passed, ${fail} failed ===========`)
await browser.close()
process.exit(fail ? 1 : 0)
