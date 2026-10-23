// v1.4 launch intro tests: full/short/reduced/resume modes, cold start only, tap and key skip
// without click-through, every theme lands on its board, logo lands exactly on the menu logo,
// and the first frame matches the native splash. Real time throughout (the intro uses the
// browser's animation timeline). Needs python3 + Pillow for the pixel comparisons.
// Run: node tests/intro.mjs
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PAGE = 'file://' + path.join(ROOT, 'www', 'index.html');
const SHOTS = process.env.SHOTS || fs.mkdtempSync(path.join(os.tmpdir(), 'cl-intro-'));
let fails = 0; const ok = (c, m) => { console.log(c ? '  ok  ' : '  FAIL', m); if (!c) fails++; };
const browser = await chromium.launch();
async function ctxPage(opts = {}){
  const ctx = await browser.newContext(Object.assign({ viewport:{ width:390, height:844 } }, opts));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  return { ctx, page, errors };
}
const log = page => page.evaluate(() => Object.assign({}, Intro.log, { overlay: !!document.querySelector('#intro'), seen: localStorage.getItem('cl1.introSeen'), screen: current }));
const py = (code, ...args) => execFileSync('python3', ['-c', code, ...args]).toString().trim();
const DIFF = `
import sys
from PIL import Image, ImageChops
a=Image.open(sys.argv[1]).convert('RGB'); b=Image.open(sys.argv[2]).convert('RGB')
if len(sys.argv)>3:
    box=tuple(int(v) for v in sys.argv[3].split(',')); a=a.crop(box); b=b.crop(box)
d=ImageChops.difference(a,b); px=list(d.get_flattened_data() if hasattr(d,'get_flattened_data') else d.getdata()); n=len(px)
mean=sum(sum(p) for p in px)/(3*n); mx=max(max(p) for p in px); off=sum(1 for p in px if max(p)>8)
print(f"{mean:.3f} {mx} {off/n*100:.2f}")`;
const LINE = `
import sys
from PIL import Image
def stats(path, box):
    g=Image.open(path).convert('L').crop(box); w,h=g.size; px=g.load(); lo=min(px[x,y] for x in range(w) for y in range(h))
    ink=0; my=0
    for x in range(w):
        for y in range(h): v=px[x,y]-lo; ink+=v; my+=v*y
    return ink, my/max(ink,1)
box=tuple(int(v) for v in sys.argv[3].split(','))
ia,ya=stats(sys.argv[1],box); ib,yb=stats(sys.argv[2],box)
print(f"{abs(ya-yb):.3f} {abs(ia-ib)/max(ib,1)*100:.2f}")`;

console.log('Modes and cold start');
{
  const { ctx, page, errors } = await ctxPage();
  await page.goto(PAGE);
  ok(await page.evaluate(() => !!document.querySelector('#intro')), 'overlay present from the first paint');
  await page.waitForTimeout(2600);
  let L = await log(page);
  ok(L.mode === 'full' && !L.overlay && L.seen === 'true', 'first launch plays the full intro, then removes it');
  ok(L.end - L.start <= 2500, `full intro length ${Math.round(L.end - L.start)} ms (limit 2500)`);
  await page.reload(); await page.waitForTimeout(1200);
  L = await log(page);
  ok(L.mode === 'short' && !L.overlay, 'later launch plays the short version');
  ok(L.end - L.start < 1000, `short intro length ${Math.round(L.end - L.start)} ms (limit 1000)`);
  const startBefore = L.start;
  await page.click('[data-go="settings"]'); await page.click('#settings [data-go="menu"]');
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value:true, configurable:true }); document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'hidden', { value:false, configurable:true }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(300);
  L = await log(page);
  ok(!L.overlay && L.start === startBefore && L.screen === 'menu', 'returning to the menu or from the background never replays it');
  ok(errors.length === 0, 'no JS errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await ctx.close();
}

console.log('Skip');
{
  const { ctx, page, errors } = await ctxPage();
  await page.goto(PAGE); await page.waitForTimeout(700);
  const box = await page.evaluate(() => { const r = document.querySelector('#mNew').getBoundingClientRect(); return { x:r.left + r.width / 2, y:r.top + r.height / 2 }; });
  const t0 = Date.now();
  await page.mouse.click(box.x, box.y); // lands exactly where the New game card is, under the overlay
  await page.waitForFunction(() => !document.querySelector('#intro'), null, { timeout:2000 });
  const gone = Date.now() - t0;
  const L = await log(page);
  ok(L.mode === 'skipped' && L.seen === 'true', 'a tap skips the intro');
  ok(gone <= 600, `overlay gone ${gone} ms after the tap`);
  ok(L.screen === 'menu', 'the skip tap did not open New game (no click-through)');
  await page.click('#mNew');
  ok(await page.evaluate(() => current) === 'setup', 'New game works normally after the skip');
  await page.goto(PAGE + '#k'); await page.evaluate(() => localStorage.removeItem('cl1.introSeen')); await page.reload(); await page.waitForTimeout(500);
  await page.keyboard.press('Escape'); await page.waitForTimeout(600);
  ok((await log(page)).overlay === false, 'Escape also skips');
  ok(errors.length === 0, 'no JS errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await ctx.close();
}

console.log('Resume and reduced motion');
{
  const { ctx, page, errors } = await ctxPage();
  await page.goto(PAGE); await page.waitForTimeout(2600);
  await page.evaluate(() => { settings.input = 'tap'; saveSettings(); });
  await page.click('#mNew'); await page.click('#startBtn'); await page.click('#readyBtn'); await page.waitForTimeout(2800);
  await page.click('#tapGot'); await page.waitForTimeout(500);
  const t0 = Date.now();
  await page.reload();
  await page.click('#mResume', { timeout:3000 });
  const toResume = Date.now() - t0;
  const L = await log(page);
  ok(L.mode === 'resume' && L.end - L.start <= 300, `saved game: intro reduced to a ${Math.round(L.end - L.start)} ms fade`);
  ok(toResume < 1500 && L.screen === 'handoff', `Resume tapped ${toResume} ms after relaunch (includes page load)`);
  ok(errors.length === 0, 'no JS errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await ctx.close();
}
{
  const { ctx, page, errors } = await ctxPage({ reducedMotion:'reduce' });
  await page.goto(PAGE); await page.waitForTimeout(800);
  const L = await log(page);
  ok(L.mode === 'reduced' && !L.overlay && L.end - L.start <= 300, `Reduce Motion: ${Math.round(L.end - L.start)} ms fade, no writing`);
  ok(errors.length === 0, 'no JS errors');
  await ctx.close();
}

console.log('Themes');
{
  const { ctx, page, errors } = await ctxPage();
  await page.goto(PAGE); await page.waitForTimeout(2600);
  await page.evaluate(() => localStorage.setItem('cl1.stats', JSON.stringify({ games:3, daily:{ a:1, b:1, c:1 }, deck:{ uae:[30,20] } })));
  for (const id of ['chalk','cork','majlis','garden']) {
    await page.evaluate(i => localStorage.setItem('cl1.settings', JSON.stringify({ board:i, boardAt:1 })), id);
    await page.reload(); await page.waitForTimeout(1200);
    const r = await page.evaluate(() => ({ board: document.documentElement.dataset.board, overlay: !!document.querySelector('#intro'), screen: current }));
    ok(r.board === id && !r.overlay && r.screen === 'menu', `${id}: intro ends on the ${id} board`);
    await page.screenshot({ path: path.join(SHOTS, `end-${id}.png`) });
  }
  ok(errors.length === 0, 'no JS errors');
  await ctx.close();
}

console.log('Logo lands on the menu logo');
for (const vp of [{ width:390, height:844 }, { width:844, height:390 }]) {
  const { ctx, page } = await ctxPage({ viewport:vp });
  await page.goto(PAGE); await page.waitForTimeout(2600);
  const boxes = await page.evaluate(() => {
    const el = document.createElement('div'); el.id = 'intro'; el.style.cssText = 'position:fixed;inset:0;z-index:9999;background:transparent;animation:none';
    document.body.prepend(el); Intro.el = el; const m = Intro.measure(); const B = Intro.build(m, false);
    B.letters.forEach(l => { l.ls.style.display = 'none'; l.lf.style.opacity = 1; }); B.up.style.strokeDashoffset = 0;
    const h1 = document.querySelector('#menu .logo h1'), us = document.querySelector('#menu .logo svg');
    h1.style.visibility = 'hidden'; us.style.visibility = 'hidden'; // show only the overlay's copy
    const b = r => [Math.floor(r.left) - 2, Math.floor(r.top) - 2, Math.ceil(r.right) + 2, Math.ceil(r.bottom) + 2].join(',');
    return { letters: b(h1.getBoundingClientRect()), underline: b(us.getBoundingClientRect()) };
  });
  const a = path.join(SHOTS, `align-intro-${vp.width}.png`), b = path.join(SHOTS, `align-menu-${vp.width}.png`);
  await page.screenshot({ path:a });
  await page.evaluate(() => { document.querySelector('#intro').remove(); document.querySelector('#menu .logo h1').style.visibility = ''; document.querySelector('#menu .logo svg').style.visibility = ''; });
  await page.screenshot({ path:b });
  let [mean, mx, off] = py(DIFF, a, b, boxes.letters).split(' ').map(Number);
  ok(off < 0.5, `${vp.width}x${vp.height} letters: written logo vs menu logo, mean diff ${mean}/255, ${off}% of pixels differ by >8`);
  const [dy, dink] = py(LINE, a, b, boxes.underline).split(' ').map(Number);
  ok(dy <= 0.25 && dink <= 2, `${vp.width}x${vp.height} underline: position off by ${dy} px, ink differs ${dink}%`);
  await ctx.close();
}

console.log('First frame matches the native splash');
const splash = path.join(ROOT, 'assets', 'splash.png');
for (const vp of [{ width:390, height:844 }, { width:430, height:932 }, { width:375, height:667 }]) {
  // what iOS shows: splash.png scaled aspect-fill to the screen
  const sim = path.join(SHOTS, `splash-${vp.width}.png`);
  py(`
import sys
from PIL import Image
im=Image.open(sys.argv[1]).convert('RGB'); W,H=int(sys.argv[2]),int(sys.argv[3])
s=max(W/im.width,H/im.height); im=im.resize((round(im.width*s),round(im.height*s)))
l=(im.width-W)//2; t=(im.height-H)//2; im.crop((l,t,l+W,t+H)).save(sys.argv[4])`, splash, String(vp.width), String(vp.height), sim);
  for (const [label, js] of [['before any script runs', false], ['first frame with script', true]]) {
    const { ctx, page } = await ctxPage({ viewport:vp, javaScriptEnabled:js });
    await page.goto(PAGE, { waitUntil:'commit' }); await page.waitForSelector('#intro', { state:'attached' });
    const f = path.join(SHOTS, `first-${vp.width}-${js ? 'js' : 'nojs'}.png`);
    await page.screenshot({ path:f });
    const [mean, mx] = py(DIFF, sim, f).split(' ').map(Number);
    ok(mx <= 2, `${vp.width}x${vp.height} ${label}: mean diff ${mean}/255, max ${mx}`);
    await ctx.close();
  }
}

await browser.close();
console.log(fails ? `\n${fails} failed` : '\nAll intro checks passed'); process.exit(fails ? 1 : 0);
