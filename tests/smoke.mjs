// Chalkline smoke tests: cold start, full game, kill-and-relaunch mid-turn, daily deck, deck search, tilt input.
// Run:  npx playwright install chromium && node tests/smoke.mjs   (from repo root)
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PAGE = 'file://' + path.join(ROOT, 'www', 'index.html');
const SHOTS = process.env.SHOTS || '';
let failures = 0;
const ok = (c, m) => { if (c) console.log('  ok  ', m); else { failures++; console.log('  FAIL', m); } };
const shot = async (page, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive:true }); await page.screenshot({ path: path.join(SHOTS, name + '.png') }); } };

const browser = await chromium.launch();
async function fresh(viewport = { width:390, height:844 }) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_FILE_NOT_FOUND|net::/.test(m.text())) errors.push(m.text()); });
  await page.clock.install();
  return { ctx, page, errors };
}
const tick = (page, ms) => page.clock.runFor(ms);
const vis = (page, sel) => page.locator(sel).isVisible();

// ---------- 1. cold start + full 2-team game ----------
console.log('Cold start and full game');
{
  const { ctx, page, errors } = await fresh();
  const t0 = Date.now();
  await page.goto(PAGE);
  await tick(page, 1300);
  ok(await vis(page, '#menu'), 'menu visible after cold start');
  ok(Date.now() - t0 < 5000, 'cold start under 5s wall time');
  await shot(page, '01-menu');
  await page.click('#mNew');
  ok(await vis(page, '#setup'), 'setup opens');
  await page.locator('#segTimer button[data-v="30"]').click();
  await page.locator('#segRounds button[data-v="1"]').click();
  await page.locator('#segStyles button[data-v="0"]').click(); // exact-score checks below assume no style bonus
  await shot(page, '02-setup');
  await page.click('#startBtn');
  ok(await vis(page, '#handoff'), 'handoff shows');
  ok((await page.textContent('#hoWho')).includes('Red team'), 'first team is Red team');
  await page.click('#hoInput'); // switch to tap buttons
  await page.click('#readyBtn');
  await tick(page, 2600);
  ok(await vis(page, '#play'), 'play screen after countdown');
  const w1 = await page.textContent('#cWord');
  ok(w1 && w1.length > 0, 'a word is showing: ' + w1);
  for (let i = 0; i < 4; i++) { await page.click('#tapGot'); await tick(page, 500); }
  await page.click('#tapPass'); await tick(page, 500);
  await shot(page, '03-play-portrait');
  ok((await page.textContent('#phScore')) === '12', 'score 12 after 4 medium right (2+2+4+4)');
  // --- kill and relaunch mid-turn ---
  const saved = await page.evaluate(() => localStorage.getItem('cl1.session'));
  ok(!!saved && JSON.parse(saved).turn.results.length === 5, 'session saved with 5 results before kill');
  await page.reload(); await tick(page, 1300);
  ok(await vis(page, '#mResume'), 'menu offers Resume game after relaunch');
  await page.click('#mResume');
  ok((await page.textContent('#hoSub')).includes('Picking up'), 'handoff says picking up with time left');
  await page.click('#readyBtn'); await tick(page, 2600);
  ok((await page.textContent('#phScore')) === '12', 'score preserved after relaunch');
  await tick(page, 31000);
  ok(await vis(page, '#recap'), 'recap after timer ends');
  ok((await page.locator('#rcList .res').count()) === 5, 'recap lists 5 cards');
  await page.locator('#rcList .res').nth(4).click(); // flip the pass to right
  ok((await page.textContent('#rcScore')) === '16', 'flipping a pass to right gives 16 (run of 5)');
  await shot(page, '04-recap');
  await page.click('#rcNext');
  ok(await vis(page, '#board'), 'scoreboard shows between turns');
  await page.click('#bdNext');
  ok((await page.textContent('#hoWho')).includes('Blue team'), 'next turn is Blue team');
  await page.click('#readyBtn'); await tick(page, 2600);
  await page.click('#tapGot'); await tick(page, 500);
  await tick(page, 31000);
  await page.click('#rcNext');
  ok(await vis(page, '#final'), 'final scores shown');
  ok((await page.textContent('#fnTitle')).includes('Red team wins'), 'Red team wins');
  await tick(page, 1600);
  await shot(page, '05-final');
  const hist = await page.evaluate(() => JSON.parse(localStorage.getItem('cl1.history')));
  ok(hist && hist.length === 1 && hist[0].teams[0][1] === 16, 'history recorded');
  ok(!(await page.evaluate(() => localStorage.getItem('cl1.session'))), 'session cleared after finish');
  ok(errors.length === 0, 'no JS errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await ctx.close();
}

// ---------- 2. kill during the recap ----------
console.log('Kill during recap');
{
  const { ctx, page, errors } = await fresh();
  await page.goto(PAGE); await tick(page, 1300);
  await page.evaluate(() => { localStorage.setItem('cl1.settings', JSON.stringify({ input:'tap' })); localStorage.setItem('cl1.setup', JSON.stringify({ timer:30, rounds:1, styles:false })); });
  await page.reload(); await tick(page, 1300);
  await page.click('#mNew'); await page.click('#startBtn'); await page.click('#readyBtn'); await tick(page, 2600);
  await page.click('#tapGot'); await tick(page, 31500);
  ok(await vis(page, '#recap'), 'reached recap');
  await page.reload(); await tick(page, 1300);
  await page.click('#mResume');
  ok(await vis(page, '#recap'), 'relaunch returns straight to the uncommitted recap');
  ok(errors.length === 0, 'no JS errors');
  await ctx.close();
}

// ---------- 3. daily deck is deterministic ----------
console.log('Daily deck');
{
  const { ctx, page, errors } = await fresh();
  await page.goto(PAGE); await tick(page, 1300);
  const a = await page.evaluate(() => dailyDeck('2026-10-13').slice(0,5).join(','));
  const b = await page.evaluate(() => dailyDeck('2026-10-13').slice(0,5).join(','));
  const c = await page.evaluate(() => dailyDeck('2026-10-14').slice(0,5).join(','));
  ok(a === b && a !== c, 'same seed same deck, next day different');
  await page.evaluate(() => localStorage.setItem('cl1.settings', JSON.stringify({ input:'tap' })));
  await page.reload(); await tick(page, 1300);
  await page.click('#mDaily'); await page.click('#readyBtn'); await tick(page, 2600);
  await page.click('#tapGot'); await tick(page, 500); await page.click('#tapGot'); await tick(page, 61000);
  await page.click('#rcNext');
  ok(await vis(page, '#final'), 'daily final shown');
  await page.click('#final [data-go="menu"]');
  ok((await page.textContent('#mDaily')).includes('Today:'), 'menu shows today\'s daily score');
  ok(errors.length === 0, 'no JS errors');
  await ctx.close();
}

// ---------- 4. deck search + no-repeat ----------
console.log('Deck search and freshness');
{
  const { ctx, page, errors } = await fresh();
  await page.goto(PAGE); await tick(page, 1300);
  await page.click('#mNew'); await page.click('#openPicker');
  await page.fill('#deckSearch', 'pizza');
  const names = await page.locator('#deckList .nm').allTextContents();
  ok(names.includes('Food & drink'), 'searching a word finds its deck: ' + names.join(', '));
  await page.fill('#deckSearch', 'mov');
  ok((await page.locator('#deckList .nm').allTextContents()).includes('Movies'), 'searching a deck name works');
  await shot(page, '06-picker');
  const r = await page.evaluate(() => {
    const d1 = buildDeck(['movies'], 'M', 1).slice(0, 60);
    d1.forEach(markSeen);
    const d2 = buildDeck(['movies'], 'M', 2).slice(0, 40);
    return d2.filter(k => d1.includes(k)).length;
  });
  ok(r === 0, 'next game serves unseen words first (overlap ' + r + ')');
  ok(errors.length === 0, 'no JS errors');
  await ctx.close();
}

// ---------- 5. tilt input with simulated motion ----------
console.log('Tilt input');
{
  const { ctx, page, errors } = await fresh({ width:844, height:390 });
  await page.goto(PAGE); await tick(page, 1300);
  await page.evaluate(() => {
    window.__z = -7; // phone in hand, screen toward the reader
    setInterval(() => window.dispatchEvent(new DeviceMotionEvent('devicemotion', { accelerationIncludingGravity:{ x:0, y:9.8, z:window.__z } })), 16);
    localStorage.setItem('cl1.setup', JSON.stringify({ timer:60, rounds:1, teams:[{name:'Solo',players:''}] }));
  });
  await page.reload(); await tick(page, 1300);
  await page.evaluate(() => {
    window.__z = -7;
    setInterval(() => window.dispatchEvent(new DeviceMotionEvent('devicemotion', { accelerationIncludingGravity:{ x:0, y:9.8, z:window.__z } })), 16);
  });
  await page.click('#mNew'); await page.click('#startBtn');
  await page.click('#readyBtn');
  await tick(page, 400);
  await page.evaluate(() => window.__z = 0); // on the forehead
  await tick(page, 2600);
  ok(await page.evaluate(() => document.querySelector('#play').classList.contains('tilt')), 'tilt mode active (tap buttons hidden)');
  ok(await page.evaluate(() => Tilt.faceUp) === -1, 'face-up sign learned from the in-hand reading');
  await tick(page, 400);
  await page.evaluate(() => window.__z = 8); await tick(page, 300);  // nod down
  await page.evaluate(() => window.__z = 0); await tick(page, 700);  // back to neutral
  await page.evaluate(() => window.__z = -8); await tick(page, 300); // tip up
  await page.evaluate(() => window.__z = 0); await tick(page, 700);
  await page.evaluate(() => window.__z = 8); await tick(page, 300);
  await page.evaluate(() => window.__z = 8); await tick(page, 600);  // held down: must not double-fire
  await page.evaluate(() => window.__z = 0); await tick(page, 700);
  const res = await page.evaluate(() => session.turn.results.map(r => r.ok ? 'G' : 'P').join(''));
  ok(res === 'GPG', 'tilt down/up/down gives G P G (got ' + res + ')');
  await shot(page, '07-play-landscape-tilt');
  ok(errors.length === 0, 'no JS errors');
  await ctx.close();
}

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
