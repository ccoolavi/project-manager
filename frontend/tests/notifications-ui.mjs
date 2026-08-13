import { chromium } from 'playwright'
const URL = 'https://ccoolavi.github.io/project-manager/'
const SHOTS = './shots'
const stamp = Date.now()
const PASS = 'TestPass123'
let pass = 0, fail = 0
const ok = (c, m) => { c ? (console.log(`  PASS  ${m}`), pass++) : (console.log(`  FAIL  ${m}`), fail++) }

const browser = await chromium.launch()
const OWNER = `bellowner${stamp}@test.com`
const MEMBER = `bellmember${stamp}@test.com`

async function registerAndOrg(page, email, orgName) {
  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.getByRole('link', { name: /sign up/i }).click()
  await page.waitForTimeout(800)
  await page.locator('input[type="text"]').first().fill('Bell Test')
  await page.locator('input[type="email"]').fill(email)
  const pw = page.locator('input[type="password"]')
  await pw.nth(0).fill(PASS)
  await pw.nth(1).fill(PASS)
  await page.getByRole('button', { name: /sign up|create|register/i }).click()
  await page.waitForTimeout(4000)
  if (orgName) {
    await page.locator('input[placeholder*="Organization" i]').fill(orgName)
    await page.getByRole('button', { name: /create organization/i }).click()
    await page.waitForTimeout(4000)
  }
}

// Two independent browser contexts = two independent "devices", each trusted
// for its own account from the moment it registers.
const memberCtx = await browser.newContext()
const memberPage = await memberCtx.newPage()
await registerAndOrg(memberPage, MEMBER, null)

const ownerCtx = await browser.newContext()
const ownerPage = await ownerCtx.newPage()
await registerAndOrg(ownerPage, OWNER, 'Bell Test Org')
await ownerPage.getByText(/^Settings$/).first().click()
await ownerPage.waitForTimeout(1500)
await ownerPage.locator('input[type="email"]').last().fill(MEMBER)
await ownerPage.getByRole('button', { name: /^Invite$/ }).click()
await ownerPage.waitForTimeout(2500)

// Back on the member's own (already-trusted) device/context: reload to pick up the notification.
await memberPage.reload({ waitUntil: 'networkidle' })
await memberPage.waitForTimeout(3000)
await memberPage.screenshot({ path: `${SHOTS}/bell-1-badge.png` })
const bellLabel = await memberPage.locator('button[aria-label*="Notifications"]').getAttribute('aria-label')
ok(/1 unread/.test(bellLabel || ''), `bell shows unread badge (aria-label: "${bellLabel}")`)

await memberPage.locator('button[aria-label*="Notifications"]').click()
await memberPage.waitForTimeout(1000)
await memberPage.screenshot({ path: `${SHOTS}/bell-2-dropdown.png` })
const text = await memberPage.locator('body').innerText()
ok(/Added to an organisation/i.test(text), 'invite notification appears in the dropdown')

await memberPage.getByText(/Mark all read/i).click()
await memberPage.waitForTimeout(2000)
const bellLabelAfter = await memberPage.locator('button[aria-label*="Notifications"]').getAttribute('aria-label')
ok(!/unread/.test(bellLabelAfter || ''), `badge cleared after mark-all-read (aria-label: "${bellLabelAfter}")`)

console.log(`\n=========== NOTIFICATION BELL UI RESULT: ${pass} passed, ${fail} failed ===========`)
await browser.close()
process.exit(fail ? 1 : 0)
