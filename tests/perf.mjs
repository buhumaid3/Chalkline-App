// Frame-time measurement per animated moment, Chromium with 4x CPU throttling.
// A proxy for an older iPhone, not a substitute for one. Run: node tests/perf.mjs
import { chromium } from 'playwright';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PAGE = 'file://' + path.join(ROOT, 'www', 'index.html');
const browser = await chromium.launch();
// Launch intro, measured from the very first frame: a recorder injected before the page's own script.
const introRows = [];
for (const [label, prep] of [['Intro: full (first launch)', null], ['Intro: short (later launches)', 'short']]) {
  const c = await browser.newContext({ viewport:{ width:390, height:844 }, deviceScaleFactor:2 });
  if (prep) await c.addInitScript(() => { try { localStorage.setItem('cl1.introSeen', 'true'); } catch(e){} });
  await c.addInitScript(() => { window.__f = []; let last = performance.now(); const f = t => { window.__f.push(t - last); last = t; if (window.__f.length < 400) requestAnimationFrame(f); }; requestAnimationFrame(f); });
  const pg = await c.newPage(); const s = await c.newCDPSession(pg); await s.send('Emulation.setCPUThrottlingRate', { rate:4 });
  await pg.goto(PAGE); await pg.waitForTimeout(prep ? 1500 : 2800);
  const r = await pg.evaluate(() => { const L = Intro.log; let acc = 0; const out = []; for (const d of window.__f.slice(1)) { acc += d; if (acc >= L.start && acc <= L.end) out.push(d); } return { d: out, ms: L.end - L.start, mode: L.mode }; });
  const d = r.d, st = d.slice().sort((a,b) => a-b);
  introRows.push([`${label} ${Math.round(r.ms)} ms`, d.length, d.reduce((a,b) => a+b, 0) / d.length, st[Math.floor(st.length * .95)], st[st.length-1], d.filter(x => x > 20).length / d.length * 100]);
  await c.close();
}
const ctx = await browser.newContext({ viewport:{ width:390, height:844 }, deviceScaleFactor:2 });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await page.goto(PAGE); await page.waitForTimeout(600);
await page.evaluate(() => { localStorage.setItem('cl1.settings', JSON.stringify({ input:'tap', board:'majlis', boardAt:1 }));
  localStorage.setItem('cl1.stats', JSON.stringify({ games:3, deck:{ uae:[30,20] } }));
  localStorage.setItem('cl1.setup', JSON.stringify({ timer:30, rounds:1, teams:[{name:'Red team',players:''},{name:'Blue team',players:''}] })); });
await cdp.send('Emulation.setCPUThrottlingRate', { rate:4 });
const start = () => page.evaluate(() => { window.__f = []; window.__on = true; let last = performance.now();
  const f = t => { if (!window.__on) return; window.__f.push(t - last); last = t; requestAnimationFrame(f); }; requestAnimationFrame(f); });
const stop = () => page.evaluate(() => { window.__on = false; return window.__f.slice(1); });
const rows = [];
async function measure(name, action, ms){
  await start(); await action(); await page.waitForTimeout(ms); const d = await stop();
  const s = d.slice().sort((a,b) => a-b), avg = d.reduce((a,b) => a+b, 0) / d.length;
  rows.push([name, d.length, avg, s[Math.floor(s.length * .95)], s[s.length-1], d.filter(x => x > 20).length / d.length * 100]);
}
await page.reload({ waitUntil:'domcontentloaded' });
await measure('Relaunch to menu (short intro)', async () => {}, 2200);
await page.click('#mNew'); await page.click('#startBtn');
await measure('Countdown: chalk scrawl + eraser', async () => { await page.click('#readyBtn'); }, 2500);
await measure('Card reveal (8 answers)', async () => { for (let i = 0; i < 8; i++) { await page.click('#tapGot'); await page.waitForTimeout(420); } }, 300);
await page.evaluate(() => { streak = 9; });
await measure('Run tier 10: light chase', async () => { await page.click('#tapGot'); }, 1200);
await page.evaluate(() => { deadline = performance.now() + 5600; });
await measure('Kitchen timer: last 5 s shake', async () => {}, 4800);
await page.waitForTimeout(1200);
await page.click('#rcNext');
await measure('Scoreboard: tallies draw in', async () => {}, 2200);
await page.click('#bdNext'); await page.click('#readyBtn'); await page.waitForTimeout(2600); await page.click('#tapGot'); await page.waitForTimeout(500);
await page.click('#pauseBtn'); await page.click('#endTurnBtn');
await measure('Final: confetti + badge stamp', async () => { await page.click('#rcNext'); }, 2800);
await measure('Award toast: pin-up', async () => { await page.evaluate(() => toast('Test award', 2000, 'award', 'Award unlocked')); }, 900);
console.log('CPU throttle 4x, 390x844 @2x. Frame interval in ms (16.7 = 60 fps).');
console.log('Moment'.padEnd(40) + 'frames   avg    p95    max   >20ms');
introRows.concat(rows).forEach(([n,c,a,p,m,j]) => console.log(n.padEnd(40) + String(c).padStart(6) + a.toFixed(1).padStart(7) + p.toFixed(1).padStart(7) + m.toFixed(1).padStart(7) + (j.toFixed(1) + '%').padStart(8)));
await browser.close();
