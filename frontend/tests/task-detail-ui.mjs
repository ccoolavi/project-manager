import { chromium } from 'playwright'
const URL = 'https://ccoolavi.github.io/project-manager/'
const SHOTS = './shots'
const stamp = Date.now()
const EMAIL = `td${stamp}@test.com`
const PASS = 'TestPass123'
let pass = 0, fail = 0
const ok = (c, m) => { c ? (console.log(`  PASS  ${m}`), pass++) : (console.log(`  FAIL  ${m}`), fail++) }

const browser = await chromium.launch()
const p = await (await browser.newContext()).newPage()

await p.goto(URL, { waitUntil: 'networkidle' })
await p.getByRole('link', { name: /sign up/i }).click()
await p.waitForTimeout(800)
await p.locator('input[type="text"]').first().fill('Task Detail Test')
await p.locator('input[type="email"]').fill(EMAIL)
const pw = p.locator('input[type="password"]')
await pw.nth(0).fill(PASS)
await pw.nth(1).fill(PASS)
await p.getByRole('button', { name: /sign up|create|register/i }).click()
await p.waitForTimeout(4000)
await p.locator('input[placeholder*="Organization" i]').fill('TD Org')
await p.getByRole('button', { name: /create organization/i }).click()
await p.waitForTimeout(4000)
await p.locator('input[placeholder*="New project" i]').fill('TD Project')
await p.locator('input[placeholder*="New project" i]').press('Enter')
await p.waitForTimeout(4000)
await p.locator('input[placeholder*="task" i]').first().fill('Detail panel task')
await p.locator('input[placeholder*="task" i]').first().press('Enter')
await p.waitForTimeout(3000)

// Open the panel by clicking the card (not the delete button)
await p.getByText('Detail panel task').click()
await p.waitForTimeout(1500)
await p.screenshot({ path: `${SHOTS}/td-1-open.png` })
ok(await p.locator('input[aria-label="Task title"]').isVisible(), 'panel opened with editable title field')

// Edit title inline
const titleInput = p.locator('input[aria-label="Task title"]')
await titleInput.fill('Renamed via panel')
await titleInput.blur()
await p.waitForTimeout(2000)

// Set story points
await p.locator('input[type="number"]').fill('8')
await p.locator('input[type="number"]').blur()
await p.waitForTimeout(1500)

// Set due date
const dateInputs = p.locator('input[type="date"]')
await dateInputs.nth(1).fill('2026-09-15')
await p.waitForTimeout(1500)

// Change priority
await p.locator('select').nth(2).selectOption('urgent')
await p.waitForTimeout(1500)
await p.screenshot({ path: `${SHOTS}/td-2-edited.png` })

// Close and reopen to confirm persistence (survives reload from server, not just local state)
await p.getByLabel('Close', { exact: true }).click()
await p.waitForTimeout(1000)
await p.reload({ waitUntil: 'networkidle' })
await p.waitForTimeout(5000)
const boardText = await p.locator('body').innerText()
ok(/Renamed via panel/.test(boardText), 'renamed title persisted to the server (survives reload)')

await p.getByText('Renamed via panel').click()
await p.waitForTimeout(1500)
await p.screenshot({ path: `${SHOTS}/td-3-reopened.png` })
const spValue = await p.locator('input[type="number"]').inputValue()
ok(spValue === '8', `story points persisted (got "${spValue}")`)
const dueValue = await p.locator('input[type="date"]').nth(1).inputValue()
ok(dueValue === '2026-09-15', `due date persisted (got "${dueValue}")`)
const priorityValue = await p.locator('select').nth(2).inputValue()
ok(priorityValue === 'urgent', `priority persisted (got "${priorityValue}")`)

console.log(`\n=========== TASK DETAIL PANEL RESULT: ${pass} passed, ${fail} failed ===========`)
await browser.close()
process.exit(fail ? 1 : 0)
