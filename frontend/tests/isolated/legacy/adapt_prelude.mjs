import { chromium as real } from 'playwright-core';
const EXE = process.env.HOME + '/.cache/ms-playwright/chromium-1234/chrome-linux/chrome';
export const leaks = [];
const block = (ctx) => ctx.route(/trycloudflare\.com|github\.io|api\.github\.com/, (r) => { leaks.push(r.request().url()); r.abort(); }).then(() => ctx);
export const chromium = {
  async launch(o = {}) {
    const b = await real.launch({ executablePath: EXE, args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'], ...o });
    const nc = b.newContext.bind(b), np = b.newPage.bind(b);
    b.newContext = async (...a) => block(await nc(...a));
    b.newPage = async (...a) => { const ctx = await b.newContext(); return ctx.newPage(); };
    return b;
  },
};
process.on('exit', () => { if (leaks.length) console.log('LIVE-HOST REQUESTS BLOCKED:', leaks.length, leaks[0]); });
