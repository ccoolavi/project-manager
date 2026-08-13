import { chromium } from 'playwright'
const URL = 'https://ccoolavi.github.io/project-manager/'
const SHOTS = './shots'
const stamp = Date.now()
const EMAIL = `otpui${stamp}@test.com`
const PASS = 'TestPass123'
let pass = 0, fail = 0
const ok = (c, m) => { c ? (console.log(`  PASS  ${m}`), pass++) : (console.log(`  FAIL  ${m}`), fail++) }

const browser = await chromium.launch()

// Context 1: register (this device becomes trusted automatically)
const ctx1 = await browser.newContext()
const p1 = await ctx1.newPage()
await p1.goto(URL, { waitUntil: 'networkidle' })
await p1.getByRole('link', { name: /sign up/i }).click()
await p1.waitForTimeout(800)
await p1.locator('input[type="text"]').first().fill('OTP UI Test')
await p1.locator('input[type="email"]').fill(EMAIL)
const pw = p1.locator('input[type="password"]')
await pw.nth(0).fill(PASS)
await pw.nth(1).fill(PASS)
await p1.getByRole('button', { name: /sign up|create|register/i }).click()
await p1.waitForTimeout(4000)
ok(/Welcome|organization/i.test(await p1.locator('body').innerText()), 'registered on device 1 (auto-trusted)')
await ctx1.close()

// Context 2: brand-new browser context = a device that has never seen this account
const ctx2 = await browser.newContext()
const p2 = await ctx2.newPage()
await p2.goto(URL, { waitUntil: 'networkidle' })
await p2.locator('input[type="text"]').first().fill(EMAIL)
await p2.locator('input[type="password"]').fill(PASS)
await p2.getByRole('button', { name: /^Log In$/ }).click()
await p2.waitForTimeout(10000)
await p2.screenshot({ path: `${SHOTS}/otp-challenge.png` })
const bodyText = await p2.locator('body').innerText()
ok(/6-digit code|emailed you a code/i.test(bodyText), 'login on an unrecognised device shows the OTP-entry screen')
ok(await p2.getByRole('button', { name: /verify and continue/i }).isVisible(), 'Verify button is present')
ok(!/dashboard|Tasks/i.test(bodyText), 'user is NOT let into the dashboard without the code')

console.log(`\n=========== OTP UI RESULT: ${pass} passed, ${fail} failed ===========`)
await browser.close()
process.exit(fail ? 1 : 0)
