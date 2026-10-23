// Real-time frame strips of the launch intro (every 100 ms), via the browser's screencast.
// Not part of npm test. Run: node tests/intro-frames.mjs <outDir>
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PAGE = 'file://' + path.join(ROOT, 'www', 'index.html');
const OUT = process.argv[2] || path.join(ROOT, 'build', 'intro-frames'); fs.mkdirSync(OUT, { recursive:true });
const browser = await chromium.launch();

async function strip(name, viewport, prep){
  const ctx = await browser.newContext({ viewport, deviceScaleFactor:1 });
  const page = await ctx.newPage();
  if (prep) { await page.goto(PAGE); await page.waitForTimeout(2600); await page.evaluate(prep); }
  const cdp = await ctx.newCDPSession(page), frames = [];
  cdp.on('Page.screencastFrame', f => { frames.push({ t: f.metadata.timestamp * 1000, data: f.data }); cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {}); });
  await cdp.send('Page.startScreencast', { format:'png', everyNthFrame:1, maxWidth:viewport.width, maxHeight:viewport.height });
  if (prep) await page.reload(); else await page.goto(PAGE);
  await page.waitForTimeout(2900);
  await cdp.send('Page.stopScreencast');
  const L = await page.evaluate(() => ({ origin: performance.timeOrigin, start: Intro.log.start, end: Intro.log.end, mode: Intro.log.mode }));
  const t0 = L.origin + L.start, n = Math.ceil((L.end - L.start) / 100) + 1, dir = path.join(OUT, name); fs.mkdirSync(dir, { recursive:true });
  const picked = [];
  for (let k = 0; k < n; k++) {
    const target = t0 + k * 100, f = frames.filter(x => x.t <= target + 8).pop() || frames[0];
    const file = path.join(dir, `${String(k * 100).padStart(4, '0')}.png`); fs.writeFileSync(file, Buffer.from(f.data, 'base64')); picked.push(file);
  }
  execFileSync('python3', ['-c', `
import sys, math
from PIL import Image, ImageDraw
fs=sys.argv[2:]; ims=[Image.open(f).convert('RGB') for f in fs]; w,h=ims[0].size
cols=min(len(ims), 6 if w<h else 4); rows=math.ceil(len(ims)/cols); s=0.5
W,H=int(w*s),int(h*s); o=Image.new('RGB',(cols*(W+8),rows*(H+30)),'#444'); d=ImageDraw.Draw(o)
for i,(im,f) in enumerate(zip(ims,fs)):
    x=(i%cols)*(W+8); y=(i//cols)*(H+30); o.paste(im.resize((W,H)),(x,y+26)); d.text((x+4,y+6), f.split('/')[-1][:-4]+' ms', fill='white')
o.save(sys.argv[1])`, path.join(OUT, `strip-${name}.png`), ...picked]);
  console.log(`${name}: mode ${L.mode}, ${Math.round(L.end - L.start)} ms, ${frames.length} screencast frames, ${n} strip frames`);
  await ctx.close();
}
await strip('portrait-full', { width:390, height:844 });
await strip('landscape-full', { width:844, height:390 });
await strip('portrait-short', { width:390, height:844 }, () => {});
await strip('portrait-short-majlis', { width:390, height:844 }, () => {
  localStorage.setItem('cl1.stats', JSON.stringify({ deck:{ uae:[30,20] } })); localStorage.setItem('cl1.settings', JSON.stringify({ board:'majlis', boardAt:1 })); });
await browser.close();
