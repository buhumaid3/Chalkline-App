// v1.4.1 screen-fit tests: every iPhone size, portrait and landscape, with real safe-area insets
// emulated (the app reads insets through --sat/--sar/--sab/--sal, so tests can set iOS's values).
// Checks: nothing tappable or readable under the notch / Dynamic Island / home bar, no sideways
// overflow, buttons >= 44 pt, timer and score clear of the card, card word fits and stays big,
// long screens scroll to their last control, rotating mid-screen reflows cleanly.
// Run: node tests/fit.mjs            (BROWSER=webkit to use WebKit; SHOTS=<dir> for a contact sheet)
import { chromium, webkit } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PAGE = 'file://' + path.join(ROOT, 'www', 'index.html');
const SHOTS = process.env.SHOTS || '';
const engine = process.env.BROWSER === 'webkit' ? webkit : chromium;
let fails = 0, checks = 0; const ok = (c, m) => { checks++; if (!c) { fails++; console.log('  FAIL', m); } };
// Safe-area insets in points, as iOS reports them with the status bar hidden (approximate, per device class).
const DEVICES = [
  { name:'SE',          w:375, h:667, p:{ t:0,  b:0  }, l:{ s:0,  b:0  } },
  { name:'13 mini',     w:375, h:812, p:{ t:50, b:34 }, l:{ s:50, b:21 } },
  { name:'16',          w:393, h:852, p:{ t:59, b:34 }, l:{ s:59, b:21 } },
  { name:'16 Plus',     w:430, h:932, p:{ t:59, b:34 }, l:{ s:59, b:21 } },
  { name:'16 Pro Max',  w:440, h:956, p:{ t:62, b:34 }, l:{ s:62, b:21 } },
  { name:'iPad compat', w:375, h:667, p:{ t:0,  b:0  }, l:{ s:0,  b:0  } },
];
const browser = await engine.launch();
const shots = [];

async function inspect(page, label, ins, screenId){
  const r = await page.evaluate(([ins, id]) => {
    const W = innerWidth, H = innerHeight, out = { problems:[] };
    const scr = document.getElementById(id);
    if (document.documentElement.scrollWidth > W + 1) out.problems.push(`page wider than screen (${document.documentElement.scrollWidth} > ${W})`);
    if (scr && scr.scrollWidth > scr.clientWidth + 1) out.problems.push(`screen scrolls sideways (${scr.scrollWidth} > ${scr.clientWidth})`);
    const vis = el => { const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false; const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
    // The screen is the scroll container: it must sit inside the safe area. Content scrolls inside it,
    // so what's visible of any element is its box clipped to the container.
    const sb = scr.getBoundingClientRect();
    if (sb.top < ins.t - 0.5 || sb.bottom > H - ins.b + 0.5 || sb.left < ins.l - 0.5 || sb.right > W - ins.r + 0.5)
      out.problems.push(`screen box ${Math.round(sb.left)},${Math.round(sb.top)}..${Math.round(sb.right)},${Math.round(sb.bottom)} reaches into the insets`);
    const els = [...scr.querySelectorAll('button, input, textarea, h1, h2, .word, .ph-score, .dial, .icard, .tap-row')];
    for (const el of els) {
      if (!vis(el)) continue;
      const b = el.getBoundingClientRect(), name = (el.id ? '#' + el.id : el.className || el.tagName).toString().slice(0, 30);
      const v = { left:Math.max(b.left, sb.left), right:Math.min(b.right, sb.right), top:Math.max(b.top, sb.top), bottom:Math.min(b.bottom, sb.bottom) };
      if (v.right <= v.left || v.bottom <= v.top) continue; // scrolled out of view
      if (v.left < ins.l - 0.5 || v.right > W - ins.r + 0.5 || v.top < ins.t - 0.5 || v.bottom > H - ins.b + 0.5)
        out.problems.push(`${name} visible under an inset (${Math.round(v.left)},${Math.round(v.top)}..${Math.round(v.right)},${Math.round(v.bottom)} of ${W}x${H})`);
    }
    // overlays are fixed to the whole screen: their content must stay inside the safe area
    for (const ov of document.querySelectorAll('.ov.on .inner, .ov.on > div')) {
      if (!vis(ov)) continue; const b = ov.getBoundingClientRect();
      if (b.left < ins.l - 0.5 || b.right > W - ins.r + 0.5 || b.top < ins.t - 0.5 || b.bottom > H - ins.b + 0.5) out.problems.push(`overlay content under an inset`);
    }
    if (id === 'play') {
      const card = document.querySelector('#icard').getBoundingClientRect(), word = document.querySelector('#cWord'), body = word.parentElement;
      const hit = (a, b) => !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
      for (const sel of ['#dial', '.ph-right', '.ph-team', '#tapGot', '#tapPass']) { const e = document.querySelector(sel); if (vis(e) && hit(e.getBoundingClientRect(), card)) out.problems.push(`${sel} overlaps the card`); }
      for (const sel of ['#tapGot', '#tapPass', '#pauseBtn']) { const e = document.querySelector(sel); if (!vis(e)) continue; const b = e.getBoundingClientRect(); if (b.height < 44 - 0.5 || b.width < 44) out.problems.push(`${sel} smaller than 44 pt (${Math.round(b.width)}x${Math.round(b.height)})`); }
      if (word.scrollWidth > body.clientWidth + 1 || word.scrollHeight > body.clientHeight + 1) out.problems.push('word does not fit the card');
      out.font = parseFloat(word.style.fontSize); out.card = [Math.round(card.width), Math.round(card.height)];
    }
    return out;
  }, [ins, screenId]);
  ok(r.problems.length === 0, `${label}: ${r.problems.join('; ')}`);
  return r;
}

for (const d of DEVICES) for (const orient of ['p', 'l']) {
  const W = orient === 'p' ? d.w : d.h, H = orient === 'p' ? d.h : d.w;
  const ins = orient === 'p' ? { t:d.p.t, b:d.p.b, l:0, r:0 } : { t:0, b:d.l.b, l:d.l.s, r:d.l.s };
  const tag = `${d.name} ${orient === 'p' ? 'portrait' : 'landscape'} ${W}x${H}`;
  const ctx = await browser.newContext({ viewport:{ width:W, height:H }, deviceScaleFactor:1 });
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(i => {
    localStorage.setItem('cl1.introSeen', 'true');
    localStorage.setItem('cl1.settings', JSON.stringify({ input:'tap', sideways:false }));
    localStorage.setItem('cl1.setup', JSON.stringify({ timer:60, rounds:1, styles:true, teams:[{ name:'Red team', players:'' },{ name:'Blue team', players:'' }] }));
    document.addEventListener('DOMContentLoaded', () => { const s = document.documentElement.style; s.setProperty('--sat', i.t + 'px'); s.setProperty('--sab', i.b + 'px'); s.setProperty('--sal', i.l + 'px'); s.setProperty('--sar', i.r + 'px'); });
  }, ins);
  await page.goto(PAGE); await page.waitForTimeout(1400);
  const shot = async n => { if (!SHOTS) return; const f = path.join(SHOTS, `${d.name.replace(/\s/g, '')}-${orient}-${n}.png`); await page.screenshot({ path:f }); shots.push(f); };
  // inset overlay in screenshots so the forbidden zones are visible
  if (SHOTS) await page.addStyleTag({ content:`html::after{content:"";position:fixed;inset:0;pointer-events:none;z-index:99999;border-style:solid;border-color:rgba(255,0,200,.35);border-width:${ins.t}px ${ins.r}px ${ins.b}px ${ins.l}px}` });
  await inspect(page, `${tag} menu`, ins, 'menu'); await shot('1menu');
  await page.click('#mNew'); await inspect(page, `${tag} setup (top)`, ins, 'setup');
  await page.evaluate(() => { const s = document.getElementById('setup'); s.scrollTop = s.scrollHeight; }); await page.waitForTimeout(100);
  const startOk = await page.evaluate(i => { const b = document.getElementById('startBtn').getBoundingClientRect(); return b.bottom <= innerHeight - i.b + 0.5 && b.top >= 0; }, ins);
  ok(startOk, `${tag} setup: Start game reachable by scrolling, clear of the home bar`);
  await page.click('#startBtn'); await inspect(page, `${tag} handoff`, ins, 'handoff'); await shot('2handoff');
  await page.click('#readyBtn'); await page.waitForTimeout(2700);
  const short = await page.evaluate(() => { const el = document.querySelector('#cWord'); el.textContent = 'Owl'; el.dir = 'ltr'; el.classList.remove('ar'); fitWord(el); });
  const rs = await inspect(page, `${tag} play (short word)`, ins, 'play'); await shot('3play-short');
  await page.evaluate(() => { const el = document.querySelector('#cWord'); el.textContent = 'Cloudy with a Chance of Meatballs'; fitWord(el); });
  const rl = await inspect(page, `${tag} play (long word)`, ins, 'play'); await shot('4play-long');
  ok(rs.font >= (orient === 'l' ? 90 : 70), `${tag}: short word is big (${Math.round(rs.font)} px)`);
  ok(rl.font >= 28, `${tag}: long title readable (${Math.round(rl.font)} px)`);
  await page.click('#tapGot'); await page.waitForTimeout(450); await page.click('#tapPass'); await page.waitForTimeout(450);
  await page.click('#pauseBtn'); await inspect(page, `${tag} pause overlay`, ins, 'play'); await shot('5pause');
  await page.click('#endTurnBtn');
  await inspect(page, `${tag} recap`, ins, 'recap'); await shot('6recap');
  // rotate mid-screen: recap -> other orientation -> back
  await page.setViewportSize({ width:H, height:W }); await page.waitForTimeout(200);
  const insR = orient === 'p' ? { t:0, b:d.l.b, l:d.l.s, r:d.l.s } : { t:d.p.t, b:d.p.b, l:0, r:0 };
  await page.evaluate(i => { const s = document.documentElement.style; s.setProperty('--sat', i.t + 'px'); s.setProperty('--sab', i.b + 'px'); s.setProperty('--sal', i.l + 'px'); s.setProperty('--sar', i.r + 'px'); }, insR);
  await inspect(page, `${tag} recap after rotating`, insR, 'recap');
  await page.click('#rcNext'); await inspect(page, `${tag} scoreboard after rotating`, insR, 'board');
  ok(errors.length === 0, `${tag}: no JS errors ${errors.join(' | ')}`);
  console.log(`  ${tag}: card ${rs.card.join('x')}, short word ${Math.round(rs.font)} px, long title ${Math.round(rl.font)} px`);
  await ctx.close();
}
await browser.close();
if (SHOTS) fs.writeFileSync(path.join(SHOTS, 'list.txt'), shots.join('\n'));
console.log(fails ? `\n${fails} of ${checks} checks failed (${engine.name()})` : `\nAll ${checks} fit checks passed (${engine.name()})`); process.exit(fails ? 1 : 0);
