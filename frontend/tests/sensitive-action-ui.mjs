import { chromium } from 'playwright'
const URL = 'https://ccoolavi.github.io/project-manager/'
const SHOTS = './shots'
const stamp = Date.now()
let pass = 0, fail = 0
const ok = (c, m) => { c ? (console.log(`  PASS  ${m}`), pass++) : (console.log(`  FAIL  ${m}`), fail++) }

const browser = await chromium.launch()
const ctx = await browser.newContext()
const p = await ctx.newPage()

const OWNER = `sensowner${stamp}@test.com`
const MEMBER = `sensmember${stamp}@test.com`
const PASS = 'TestPass123'

async function registerAndOrg(email, orgName) {
  await p.goto(URL, { waitUntil: 'networkidle' })
  await p.getByRole('link', { name: /sign up/i }).click()
  await p.waitForTimeout(800)
  await p.locator('input[type="text"]').first().fill('Sens Test')
  await p.locator('input[type="email"]').fill(email)
  const pw = p.locator('input[type="password"]')
  await pw.nth(0).fill(PASS)
  await pw.nth(1).fill(PASS)
  await p.getByRole('button', { name: /sign up|create|register/i }).click()
  await p.waitForTimeout(3000)
  if (orgName) {
    await p.locator('input[placeholder*="Organization" i]').fill(orgName)
    await p.getByRole('button', { name: /create organization/i }).click()
    await p.waitForTimeout(3000)
  }
}

// Member account first (no org)
await registerAndOrg(MEMBER, null)
await p.evaluate(() => { localStorage.clear() })

// Owner account + org
await registerAndOrg(OWNER, 'Sensitive Test Org')
ok(/Sensitive Test Org/.test(await p.locator('body').innerText()), 'owner created the org')

// Invite the member (auto-joins since they already have an account)
await p.getByText(/^Settings$/).first().click()
await p.waitForTimeout(2000)
await p.locator('input[type="email"]').last().fill(MEMBER)
await p.getByRole('button', { name: /^Invite$/ }).click()
await p.waitForTimeout(3000)
await p.screenshot({ path: `${SHOTS}/sens-1-invited.png` })
ok(new RegExp(MEMBER).test(await p.locator('body').innerText()), 'member appears in the roster after invite')

// Remove the member -> should trigger the sensitive-action gate (428) and open the modal
const removeBtn = p.getByRole('button', { name: `Remove ${MEMBER}` })
await removeBtn.click()
await p.waitForTimeout(3000)
await p.screenshot({ path: `${SHOTS}/sens-2-modal.png` })
const text = await p.locator('body').innerText()
ok(/Confirm this action/i.test(text), 'sensitive-action modal opened on 428')
ok(/emailed you a code/i.test(text), 'modal explains a code was emailed')
ok(await p.locator('input[aria-label="Verification code"]').isVisible(), 'code input is present')

console.log(`\n=========== SENSITIVE ACTION UI RESULT: ${pass} passed, ${fail} failed ===========`)
await browser.close()
process.exit(fail ? 1 : 0)
