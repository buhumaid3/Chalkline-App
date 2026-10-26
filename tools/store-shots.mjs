// App Store screenshots from the real build: renders app screens at 3x, then frames each one with a caption.
// Output: <out>/medium/*.png (1206x2622, required) and <out>/large/*.png (1320x2868).
// Run: node tools/store-shots.mjs <outDir>
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PAGE = 'file://' + path.join(ROOT, 'www', 'index.html');
const OUT = process.argv[2] || path.join(ROOT, 'build', 'store'); const RAW = path.join(OUT, 'raw');
fs.mkdirSync(RAW, { recursive:true });
const browser = await chromium.launch();
const STATS = { games:4, daily:{ a:5, b:6, c:7 }, deck:{ uae:[40,30] }, correct:120, bestStreak:11 };

async function app({ landscape, board = 'chalk', input = 'tap' }){
  const vp = landscape ? { width:874, height:402 } : { width:402, height:874 };
  const ctx = await browser.newContext({ viewport:vp, deviceScaleFactor:3 });
  const page = await ctx.newPage();
  await page.addInitScript(([b, st, inp]) => {
    localStorage.setItem('cl1.introSeen', 'true');
    localStorage.setItem('cl1.settings', JSON.stringify({ input:inp, sideways:false, board:b, boardAt:1, sound:false }));
    localStorage.setItem('cl1.stats', JSON.stringify(st));
    localStorage.setItem('cl1.setup', JSON.stringify({ timer:60, rounds:1, styles:true, decks:['animals','food','movies','music'], teams:[{ name:'Red team', players:'', badge:0 },{ name:'Blue team', players:'', badge:3 }] }));
  }, [board, STATS, input]);
  await page.clock.install();
  await page.goto(PAGE); await page.waitForTimeout(1400); await page.clock.runFor(1500); // the intro runs on real time
  return { ctx, page, tick: ms => page.clock.runFor(ms) };
}
async function toPlay(a){ await a.page.click('#mNew'); await a.page.click('#startBtn'); await a.page.click('#readyBtn'); await a.tick(4500); } // includes the 1.3 s motion-sensor check
async function stageCard(page, { word, style, bonus, deck, tier, score, streak, tilt, seconds }){
  await page.evaluate(o => {
    document.querySelector('#play').classList.toggle('tilt', o.tilt);
    const el = document.querySelector('#cWord'), ar = isArabic(o.word); el.textContent = o.word; el.dir = ar ? 'rtl' : 'ltr'; el.classList.toggle('ar', ar);
    const c = document.querySelector('#cStyle'); c.textContent = o.style + (o.bonus ? ' +1' : ''); c.classList.toggle('bonus', o.bonus);
    document.querySelector('#cCat').textContent = o.deck;
    document.querySelectorAll('#cTier i').forEach((x, i) => x.classList.toggle('on', i < o.tier));
    document.querySelector('#phScore').textContent = o.score;
    document.querySelector('#phSub').textContent = `${o.streak} right, 0 passed`;
    setLights(document.querySelector('#playLights'), o.streak, false, o.streak);
    deadline = performance.now() + o.seconds * 1000; session.turn.timeLeft = o.seconds * 1000; setDial(o.seconds * 1000);
    fitWord(el);
  }, { word, style, bonus, deck, tier, score, streak, tilt, seconds });
}
const shot = (page, n) => page.screenshot({ path: path.join(RAW, n + '.png') });

// 1. tilt play, landscape
{ const a = await app({ landscape:true, input:'auto' }); await toPlay(a);
  await stageCard(a.page, { word:'Penguin', style:'Act it', bonus:false, deck:'Animals', tier:1, score:9, streak:4, tilt:true, seconds:41 });
  await a.tick(50); await shot(a.page, '1-play'); await a.ctx.close(); }
// 2. clue style with bonus, landscape, tap buttons
{ const a = await app({ landscape:true }); await toPlay(a);
  await stageCard(a.page, { word:'Happy Birthday song', style:'Hum it', bonus:true, deck:'Music & dance', tier:1, score:14, streak:6, tilt:false, seconds:27 });
  await a.tick(50); await shot(a.page, '2-styles'); await a.ctx.close(); }
// 3. Arabic deck, landscape, majlis board
{ const a = await app({ landscape:true, board:'majlis', input:'auto' }); await toPlay(a);
  await stageCard(a.page, { word:'مجبوس', style:'Describe it', bonus:false, deck:'أكل وشرب', tier:2, score:12, streak:3, tilt:true, seconds:33 });
  await a.page.evaluate(() => document.fonts.ready); await a.tick(50); await shot(a.page, '3-arabic'); await a.ctx.close(); }
// 4 + 5. scoreboard and final highlights, portrait (real turns, tap mode)
{ const a = await app({ landscape:false });
  await a.page.click('#mNew'); await a.page.click('#startBtn'); await a.page.click('#readyBtn'); await a.tick(2700);
  for (const k of ['got','got','got','got','pass','got','got','got','got','got']) { await a.tick(k === 'pass' ? 3800 : 1300 + (k.length * 97) % 900); await a.page.click(k === 'got' ? '#tapGot' : '#tapPass'); await a.tick(450); }
  await a.page.click('#pauseBtn'); await a.page.click('#endTurnBtn'); await a.page.click('#rcNext'); await a.tick(2500); await a.page.waitForTimeout(3000); // tallies draw on real time
  await shot(a.page, '4-board');
  await a.page.click('#bdNext'); await a.page.click('#readyBtn'); await a.tick(2700);
  for (const k of ['got','got','pass','got','got','got']) { await a.tick(k === 'pass' ? 5200 : 1900); await a.page.click(k === 'got' ? '#tapGot' : '#tapPass'); await a.tick(450); }
  await a.page.click('#pauseBtn'); await a.page.click('#endTurnBtn'); await a.page.click('#rcNext'); await a.page.waitForTimeout(2200); // stamp and ring draw on real time
  await a.page.evaluate(() => { cancelAnimationFrame(Confetti.raf); document.querySelector('#confetti').style.display = 'none'; document.querySelector('#toast').classList.remove('on'); });
  await a.tick(1500); await a.page.evaluate(() => document.querySelector('#toast').classList.remove('on'));
  await shot(a.page, '5-final'); await a.ctx.close(); }
// 6. board themes, portrait
{ const a = await app({ landscape:false, board:'majlis' });
  await a.page.evaluate(() => { renderSettings(); show('settings'); });
  await a.page.evaluate(() => { const el = document.querySelector('#settings'); el.scrollTop = 0; }); await a.tick(100);
  await shot(a.page, '6-themes'); await a.ctx.close(); }

const SHOTS = [
  ['1-play', 'Phone on your forehead.', 'Everyone else shouts. Tilt down for Got it, up to Pass.'],
  ['2-styles', 'Every card says how to clue it.', 'Act it, describe it, one word, hum it or sounds only.'],
  ['3-arabic', 'English and Arabic decks.', '18 decks and 5,685 words, including UAE & Gulf life.'],
  ['4-board', 'A real scoreboard.', 'Chalk tallies between every turn.'],
  ['5-final', 'End the night with highlights.', 'Fastest guess, longest run, best turn.'],
  ['6-themes', 'Unlock boards by playing.', 'No ads. No purchases. No account.'],
];
const font = f => 'file://' + path.join(ROOT, 'www', 'fonts', f);
for (const [dir, W, H] of [['medium', 402, 874], ['large', 440, 956]]) {
  fs.mkdirSync(path.join(OUT, dir), { recursive:true });
  const ctx = await browser.newContext({ viewport:{ width:W, height:H }, deviceScaleFactor:3 });
  const page = await ctx.newPage();
  for (const [n, title, sub] of SHOTS) {
    const img = 'file://' + path.join(RAW, n + '.png'), land = !n.startsWith('4') && !n.startsWith('5') && !n.startsWith('6');
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:S;src:url(${font('cabin-sketch-700.woff2')})}@font-face{font-family:U;src:url(${font('archivo-600.woff2')})}
html,body{margin:0;width:100%;height:100%;overflow:hidden}
body{background:radial-gradient(120% 60% at 20% 0%,rgba(255,255,255,.07),transparent 60%),#1F2A24;color:#EDEBE4;display:flex;flex-direction:column;align-items:center}
.cap{padding:${land ? 15 : 9}vh 7vw 0;text-align:center}
h1{font:700 ${land ? 12 : 10.5}vw/1.05 S;margin:0}
p{font:600 4.3vw/1.35 U;color:rgba(237,235,228,.78);margin:3.2vw auto 0;max-width:80vw}
.ul{display:block;width:46vw;height:4vw;margin:2.4vw auto 0}
.dev{margin-top:${land ? 10 : 6}vh;border-radius:${land ? 5.5 : 9}vw;padding:${land ? 1.6 : 2.2}vw;background:#0E1411;box-shadow:0 4vw 10vw rgba(0,0,0,.55),inset 0 0 0 .5vw #3a4a40}
.dev img{display:block;border-radius:${land ? 4 : 7}vw;width:${land ? 92 : 74}vw}
${land ? '.hint{margin-top:7vh;font:600 3.8vw U;color:rgba(237,235,228,.6)}' : ''}
</style></head><body>
<div class="cap"><h1>${title}</h1><svg class="ul" viewBox="0 0 300 18"><path d="M4 11 C 40 4, 70 15, 110 9 S 180 4, 220 10 S 280 13, 296 7" fill="none" stroke="#F5B544" stroke-width="3.2" stroke-linecap="round"/></svg><p>${sub}</p></div>
<div class="dev"><img src="${img}"></div>${land ? '<div class="hint">Played sideways, screen facing out</div>' : ''}
</body></html>`;
    const f = path.join(OUT, dir, `_${n}.html`); fs.writeFileSync(f, html);
    await page.goto('file://' + f); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(150);
    const png = path.join(OUT, dir, `${n}.png`); await page.screenshot({ path:png }); fs.unlinkSync(f);
    execFileSync('python3', ['-c', 'import sys;from PIL import Image;im=Image.open(sys.argv[1]).convert("RGB");im.save(sys.argv[1]);print(sys.argv[1].split("/")[-2]+"/"+sys.argv[1].split("/")[-1], im.size, im.mode)', png], { stdio:'inherit' });
  }
  await ctx.close();
}
await browser.close();
