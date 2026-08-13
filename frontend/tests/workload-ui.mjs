import { chromium } from 'playwright'
const URL = 'https://ccoolavi.github.io/project-manager/'
const SHOTS = './shots'
const stamp = Date.now()
const EMAIL = `wl${stamp}@test.com`
const PASS = 'TestPass123'
let pass = 0, fail = 0
const ok = (c, m) => { c ? (console.log(`  PASS  ${m}`), pass++) : (console.log(`  FAIL  ${m}`), fail++) }

const browser = await chromium.launch()
const p = await (await browser.newContext()).newPage()

await p.goto(URL, { waitUntil: 'networkidle' })
await p.getByRole('link', { name: /sign up/i }).click()
await p.waitForTimeout(800)
await p.locator('input[type="text"]').first().fill('Workload Test')
await p.locator('input[type="email"]').fill(EMAIL)
const pw = p.locator('input[type="password"]')
await pw.nth(0).fill(PASS)
await pw.nth(1).fill(PASS)
await p.getByRole('button', { name: /sign up|create|register/i }).click()
await p.waitForTimeout(4000)
await p.locator('input[placeholder*="Organization" i]').fill('Workload Org')
await p.getByRole('button', { name: /create organization/i }).click()
await p.waitForTimeout(4000)
await p.locator('input[placeholder*="New project" i]').fill('WL Project')
await p.locator('input[placeholder*="New project" i]').press('Enter')
await p.waitForTimeout(4000)
await p.locator('input[placeholder*="task" i]').first().fill('My task one')
await p.locator('input[placeholder*="task" i]').first().press('Enter')
await p.waitForTimeout(3000)
// Assign it to self via the detail panel
await p.getByText('My task one').click()
await p.waitForTimeout(1500)
await p.locator('select').nth(3).selectOption({ index: 1 }) // assignee select -> first real member
await p.waitForTimeout(2000)
await p.getByLabel('Close', { exact: true }).click()
await p.waitForTimeout(1000)

await p.getByText(/^Workload$/).first().click()
await p.waitForTimeout(2500)
await p.screenshot({ path: `${SHOTS}/workload-1.png` })
const text = await p.locator('body').innerText()
ok(/Workload Test/.test(text), 'assignee name appears in the workload view')
ok(await p.locator('svg.recharts-surface').first().isVisible(), 'recharts bar chart rendered')

console.log(`\n=========== WORKLOAD RESULT: ${pass} passed, ${fail} failed ===========`)
await browser.close()
process.exit(fail ? 1 : 0)
