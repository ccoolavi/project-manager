import { chromium } from 'playwright'
const URL = 'https://ccoolavi.github.io/project-manager/'
const SHOTS = './shots'
const stamp = Date.now()
const EMAIL = `dep${stamp}@test.com`
const PASS = 'TestPass123'
let pass = 0, fail = 0
const ok = (c, m) => { c ? (console.log(`  PASS  ${m}`), pass++) : (console.log(`  FAIL  ${m}`), fail++) }

const browser = await chromium.launch()
const p = await (await browser.newContext()).newPage()

await p.goto(URL, { waitUntil: 'networkidle' })
await p.getByRole('link', { name: /sign up/i }).click()
await p.waitForTimeout(800)
await p.locator('input[type="text"]').first().fill('Dep Test')
await p.locator('input[type="email"]').fill(EMAIL)
const pw = p.locator('input[type="password"]')
await pw.nth(0).fill(PASS)
await pw.nth(1).fill(PASS)
await p.getByRole('button', { name: /sign up|create|register/i }).click()
await p.waitForTimeout(4000)
await p.locator('input[placeholder*="Organization" i]').fill('Dep Org')
await p.getByRole('button', { name: /create organization/i }).click()
await p.waitForTimeout(4000)
await p.locator('input[placeholder*="New project" i]').fill('Dep Project')
await p.locator('input[placeholder*="New project" i]').press('Enter')
await p.waitForTimeout(4000)

// Two tasks
await p.locator('input[placeholder*="task" i]').first().fill('Blocker task')
await p.locator('input[placeholder*="task" i]').first().press('Enter')
await p.waitForTimeout(2500)
await p.locator('input[placeholder*="task" i]').first().fill('Blocked task')
await p.locator('input[placeholder*="task" i]').first().press('Enter')
await p.waitForTimeout(2500)

// Open "Blocked task", add "Blocker task" as a dependency
await p.getByText('Blocked task', { exact: true }).click()
await p.waitForTimeout(1500)
await p.locator('select[aria-label="Add a blocking task"]').selectOption({ label: 'Blocker task' })
await p.getByLabel('Add dependency').click()
await p.waitForTimeout(2000)
await p.screenshot({ path: `${SHOTS}/deps-1-added.png` })
const panelText = await p.locator('body').innerText()
ok(/Blocker task/.test(panelText) && /Blocked by/.test(panelText), 'dependency chip appears in the panel')

await p.getByLabel('Close', { exact: true }).click()
await p.waitForTimeout(1500)
await p.screenshot({ path: `${SHOTS}/deps-2-lock-icon.png` })
ok(await p.locator('svg[aria-label="Blocked by another task"]').isVisible(), 'lock icon shows on the blocked Kanban card')

// Finish the blocker -> lock icon should disappear
await p.getByText('Blocker task', { exact: true }).click()
await p.waitForTimeout(1500)
await p.locator('select').nth(1).selectOption('done') // status select
await p.waitForTimeout(2000)
await p.getByLabel('Close', { exact: true }).click()
await p.waitForTimeout(1500)
await p.screenshot({ path: `${SHOTS}/deps-3-unblocked.png` })
const lockCount = await p.locator('svg[aria-label="Blocked by another task"]').count()
ok(lockCount === 0, 'lock icon disappears once the blocker is done')

console.log(`\n=========== DEPENDENCIES RESULT: ${pass} passed, ${fail} failed ===========`)
await browser.close()
process.exit(fail ? 1 : 0)
