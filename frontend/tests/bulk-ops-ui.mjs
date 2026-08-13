import { chromium } from 'playwright'
const URL = 'https://ccoolavi.github.io/project-manager/'
const SHOTS = './shots'
const stamp = Date.now()
const EMAIL = `bulk${stamp}@test.com`
const PASS = 'TestPass123'
let pass = 0, fail = 0
const ok = (c, m) => { c ? (console.log(`  PASS  ${m}`), pass++) : (console.log(`  FAIL  ${m}`), fail++) }

const browser = await chromium.launch()
const p = await (await browser.newContext()).newPage()

await p.goto(URL, { waitUntil: 'networkidle' })
await p.getByRole('link', { name: /sign up/i }).click()
await p.waitForTimeout(800)
await p.locator('input[type="text"]').first().fill('Bulk Test')
await p.locator('input[type="email"]').fill(EMAIL)
const pw = p.locator('input[type="password"]')
await pw.nth(0).fill(PASS)
await pw.nth(1).fill(PASS)
await p.getByRole('button', { name: /sign up|create|register/i }).click()
await p.waitForTimeout(4000)
await p.locator('input[placeholder*="Organization" i]').fill('Bulk Org')
await p.getByRole('button', { name: /create organization/i }).click()
await p.waitForTimeout(4000)
await p.locator('input[placeholder*="New project" i]').fill('Bulk Project')
await p.locator('input[placeholder*="New project" i]').press('Enter')
await p.waitForTimeout(4000)

for (const title of ['Bulk task A', 'Bulk task B', 'Bulk task C']) {
  await p.locator('input[placeholder*="task" i]').first().fill(title)
  await p.locator('input[placeholder*="task" i]').first().press('Enter')
  await p.waitForTimeout(2000)
}

// Select two of the three via their checkboxes
await p.locator('input[aria-label="Select Bulk task A"]').check()
await p.locator('input[aria-label="Select Bulk task B"]').check()
await p.waitForTimeout(500)
await p.screenshot({ path: `${SHOTS}/bulk-1-selected.png` })
ok(/2 selected/.test(await p.locator('body').innerText()), 'toolbar shows "2 selected"')

// Bulk set priority to urgent
await p.locator('select[aria-label="Change priority for selected tasks"]').selectOption('urgent')
await p.waitForTimeout(2500)
await p.screenshot({ path: `${SHOTS}/bulk-2-priority.png` })
const text = await p.locator('body').innerText()
const urgentCount = (text.match(/urgent/gi) || []).length
ok(urgentCount >= 2, `both selected tasks now show urgent priority (found ${urgentCount} occurrences)`)
ok(!/2 selected/.test(text), 'selection clears after a bulk action')

// Bulk delete the remaining unselected task C by selecting just it
await p.locator('input[aria-label="Select Bulk task C"]').check()
await p.waitForTimeout(500)
await p.getByLabel('Delete selected tasks').click()
await p.waitForTimeout(2500)
await p.screenshot({ path: `${SHOTS}/bulk-3-deleted.png` })
ok(!/Bulk task C/.test(await p.locator('body').innerText()), 'bulk-deleted task is gone from the board')
ok(/Bulk task A/.test(await p.locator('body').innerText()), 'non-deleted tasks remain')

console.log(`\n=========== BULK OPS RESULT: ${pass} passed, ${fail} failed ===========`)
await browser.close()
process.exit(fail ? 1 : 0)
