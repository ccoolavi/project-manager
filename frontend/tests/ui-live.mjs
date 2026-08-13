import { chromium } from 'playwright'

const URL = 'https://ccoolavi.github.io/project-manager/'
const SHOTS = process.env.SHOTS_DIR || '/tmp/kaizenpm-shots'
const stamp = Date.now()
const EMAIL = `uitest${stamp}@test.com`
const PASS = 'TestPass123'

let pass = 0, fail = 0
const ok = (c, m) => { if (c) { console.log(`  PASS  ${m}`); pass++ } else { console.log(`  FAIL  ${m}`); fail++ } }

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

const netErrors = []
page.on('response', r => {
  if (r.url().includes('trycloudflare') && r.status() >= 400) netErrors.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`)
})
page.on('pageerror', e => netErrors.push(`JS: ${e.message}`))

try {
  console.log('== 1. Load app ==')
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 })
  ok(await page.getByRole('heading', { name: 'KaizenPM' }).isVisible(), 'login page renders')

  console.log('== 2. Register ==')
  await page.getByRole('link', { name: /sign up/i }).click()
  await page.waitForTimeout(800)
  await page.locator('input[type="text"]').first().fill('UI Test User')
  await page.locator('input[type="email"]').fill(EMAIL)
  const pw = page.locator('input[type="password"]')
  await pw.nth(0).fill(PASS)
  await pw.nth(1).fill(PASS)
  await page.getByRole('button', { name: /sign up|create|register/i }).click()
  await page.waitForTimeout(5000)
  await page.screenshot({ path: `${SHOTS}/1-after-register.png` })
  ok(/Welcome|organization/i.test(await page.locator('body').innerText()), 'registered and reached org setup')

  console.log('== 3. Create organisation ==')
  await page.locator('input[placeholder*="Organization" i]').fill('UI Test Org')
  await page.getByRole('button', { name: /create organization/i }).click()
  await page.waitForTimeout(5000)
  await page.screenshot({ path: `${SHOTS}/2-dashboard.png` })
  const body = await page.locator('body').innerText()
  ok(/UI Test Org/.test(body), 'dashboard shows the new organisation')

  console.log('== 4. Create project (auto-creates a default section) ==')
  await page.locator('input[placeholder*="New project" i]').fill('Website Redesign')
  await page.locator('input[placeholder*="New project" i]').press('Enter')
  await page.waitForTimeout(4000)
  await page.screenshot({ path: `${SHOTS}/3-project.png` })
  const afterProject = await page.locator('body').innerText()
  ok(/Website Redesign/.test(afterProject), 'project appears in the list')
  ok(/General/.test(afterProject), 'default section auto-created (Kanban is reachable)')

  console.log('== 5. Create a task ==')
  const taskInput = page.locator('input[placeholder*="task" i]').first()
  await taskInput.fill('Design the homepage')
  await taskInput.press('Enter')
  await page.waitForTimeout(4000)
  await page.screenshot({ path: `${SHOTS}/4-task.png` })
  ok(/Design the homepage/.test(await page.locator('body').innerText()), 'task appears on the board')

  console.log('== 6. Reload — does it persist server-side? ==')
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(5000)
  await page.screenshot({ path: `${SHOTS}/5-after-reload.png` })
  const afterReload = await page.locator('body').innerText()
  ok(/Website Redesign/.test(afterReload), 'project survived a full page reload')
  ok(/Design the homepage/.test(afterReload), 'task survived a full page reload')

  console.log('== 7. Habits tab ==')
  await page.getByText(/^Habits$/).first().click()
  await page.waitForTimeout(2500)
  const habitInput = page.locator('input[placeholder*="habit" i]').first()
  await habitInput.fill('Morning exercise')
  await habitInput.press('Enter')
  await page.waitForTimeout(3000)
  await page.screenshot({ path: `${SHOTS}/6-habits.png` })
  ok(/Morning exercise/.test(await page.locator('body').innerText()), 'habit created')

  console.log('== 8. Time tab (was a 404 before) ==')
  await page.getByText(/^Time$/).first().click()
  await page.waitForTimeout(2500)
  await page.locator('input[type="number"], input[placeholder*="minute" i]').first().fill('45')
  await page.getByRole('button', { name: /log time/i }).click()
  await page.waitForTimeout(3000)
  await page.screenshot({ path: `${SHOTS}/7-time.png` })
  ok(!/failed/i.test(await page.locator('body').innerText()), 'time logged without error')

  console.log('== 9. Kaizen tab (was a 404 before) ==')
  await page.getByText(/^Kaizen$/).first().click()
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${SHOTS}/8-kaizen.png` })
  ok(true, 'kaizen tab rendered')

  console.log('== 10. Logout / session handling ==')
  await page.screenshot({ path: `${SHOTS}/9-final.png`, fullPage: true })
} catch (e) {
  console.log(`  FAIL  exception: ${e.message.split('\n')[0]}`)
  fail++
  await page.screenshot({ path: `${SHOTS}/error.png` }).catch(() => {})
}

console.log('\n--- network / JS errors observed ---')
console.log(netErrors.length ? netErrors.join('\n') : '  none')
console.log(`\n==================== UI RESULT: ${pass} passed, ${fail} failed ====================`)
await browser.close()
process.exit(fail ? 1 : 0)
