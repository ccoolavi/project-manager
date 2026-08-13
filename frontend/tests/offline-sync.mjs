import { chromium } from 'playwright'
const URL='https://ccoolavi.github.io/project-manager/'
const stamp=Date.now(), EMAIL=`off${stamp}@test.com`, PASS='TestPass123'
let pass=0,fail=0
const ok=(c,m)=>{c?(console.log(`  PASS  ${m}`),pass++):(console.log(`  FAIL  ${m}`),fail++)}
const b=await chromium.launch(); const ctx=await b.newContext(); const p=await ctx.newPage()
try{
  await p.goto(URL,{waitUntil:'networkidle',timeout:60000})
  await p.getByRole('link',{name:/sign up/i}).click(); await p.waitForTimeout(800)
  await p.locator('input[type="text"]').first().fill('Off User')
  await p.locator('input[type="email"]').fill(EMAIL)
  const pw=p.locator('input[type="password"]'); await pw.nth(0).fill(PASS); await pw.nth(1).fill(PASS)
  await p.getByRole('button',{name:/sign up|create|register/i}).click(); await p.waitForTimeout(5000)
  await p.locator('input[placeholder*="Organization" i]').fill('Offline Org')
  await p.getByRole('button',{name:/create organization/i}).click(); await p.waitForTimeout(5000)
  await p.locator('input[placeholder*="New project" i]').fill('Online Project')
  await p.locator('input[placeholder*="New project" i]').press('Enter'); await p.waitForTimeout(4000)
  ok(/Online Project/.test(await p.locator('body').innerText()),'baseline project created while online')

  console.log('== going offline ==')
  await ctx.setOffline(true)
  await p.waitForTimeout(1500)
  const ti=p.locator('input[placeholder*="task" i]').first()
  await ti.fill('Written while offline'); await ti.press('Enter')
  await p.waitForTimeout(4000)
  await p.screenshot({path:(process.env.SHOTS_DIR||'/tmp/kaizenpm-shots')+'/offline-1.png'})
  const off=await p.locator('body').innerText()
  ok(/offline|saved on this device|waiting to save/i.test(off),'UI tells the user they are offline with changes held')

  const queued=await p.evaluate(()=>new Promise(res=>{
    const r=indexedDB.open('kaizenpm-offline')
    r.onsuccess=()=>{const db=r.result
      if(!db.objectStoreNames.contains('queue'))return res(-1)
      const g=db.transaction('queue').objectStore('queue').getAll()
      g.onsuccess=()=>res(g.result.length); g.onerror=()=>res(-1)}
    r.onerror=()=>res(-1)}))
  ok(queued>0,`write parked in IndexedDB (queued=${queued})`)

  console.log('== back online ==')
  await ctx.setOffline(false)
  await p.evaluate(()=>window.dispatchEvent(new Event('online')))
  await p.waitForTimeout(8000)
  await p.screenshot({path:(process.env.SHOTS_DIR||'/tmp/kaizenpm-shots')+'/offline-2.png'})

  const after=await p.evaluate(()=>new Promise(res=>{
    const r=indexedDB.open('kaizenpm-offline')
    r.onsuccess=()=>{const db=r.result
      const g=db.transaction('queue').objectStore('queue').getAll()
      g.onsuccess=()=>res(g.result.length); g.onerror=()=>res(-1)}
    r.onerror=()=>res(-1)}))
  ok(after===0,`queue drained after reconnect (remaining=${after})`)

  await p.reload({waitUntil:'networkidle'}); await p.waitForTimeout(6000)
  await p.screenshot({path:(process.env.SHOTS_DIR||'/tmp/kaizenpm-shots')+'/offline-3.png'})
  ok(/Written while offline/.test(await p.locator('body').innerText()),'offline task reached the SERVER (survives reload)')
}catch(e){console.log(`  FAIL  exception: ${e.message.split('\n')[0]}`);fail++
  await p.screenshot({path:(process.env.SHOTS_DIR||'/tmp/kaizenpm-shots')+'/offline-err.png'}).catch(()=>{})}
console.log(`\n=========== OFFLINE RESULT: ${pass} passed, ${fail} failed ===========`)
await b.close(); process.exit(fail?1:0)
