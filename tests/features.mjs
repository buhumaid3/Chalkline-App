// v1.1 feature tests: clue styles, team badges, scoreboard, highlights + share, new decks, relaunch with new state.
// Run: node tests/features.mjs
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PAGE = 'file://' + path.join(ROOT, 'www', 'index.html');
const SHOTS = process.env.SHOTS || '';
let fails = 0; const ok = (c, m) => { console.log(c ? '  ok  ' : '  FAIL', m); if (!c) fails++; };
const browser = await chromium.launch();
async function fresh(viewport = { width:390, height:844 }){
  const ctx = await browser.newContext({ viewport, deviceScaleFactor:2 });
  await ctx.grantPermissions(['clipboard-read','clipboard-write']);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.clock.install(); await page.goto(PAGE); await page.clock.runFor(1300);
  await page.evaluate(() => { localStorage.setItem('cl1.settings', JSON.stringify({ input:'tap', sideways:false })); });
  await page.reload(); await page.clock.runFor(1300);
  return { ctx, page, errors, tick: ms => page.clock.runFor(ms) };
}

console.log('Clue styles');
{
  const { ctx, page, errors, tick } = await fresh();
  const pools = await page.evaluate(() => ({ a:stylePool('animals'), m:stylePool('music'), k:stylePool('kids'), c:stylePool('u_custom') }));
  ok(!pools.a.includes('hum') && pools.a.includes('sounds'), 'animals: sounds yes, humming no');
  ok(pools.m.includes('hum') && !pools.m.includes('sounds'), 'music: humming yes, sounds no');
  ok(!pools.k.includes('one'), 'little kids deck never asks for one-word clues');
  ok(pools.c.every(x => ['act','describe','one'].includes(x)), 'custom decks get act / describe / one word only');
  const same = await page.evaluate(() => { const s = { styles:true, daily:true, dailyKey:'2026-10-13', ptr:7 }; const w = { deckId:'movies' }; return pickStyle(s,w) === pickStyle(s,w); });
  ok(same, 'daily deck styles are deterministic (same for everyone)');
  await page.click('#mNew'); await page.click('#startBtn'); await page.click('#readyBtn'); await tick(2600);
  const chip = await page.textContent('#cStyle');
  ok(/^(Act it|Describe it|One word|Hum it|Sounds only)( \+1)?$/.test(chip), 'card shows a clue style: ' + chip);
  for (let i = 0; i < 6; i++) { await tick(1200); await page.click('#tapGot'); await tick(450); }
  const r = await page.evaluate(() => session.turn.results.map(x => ({ ...x, expect: x.tier + STYLE_INFO[x.style][1] })));
  ok(r.every(x => x.style && x.p === x.expect), 'points = tier points + style bonus (' + r.map(x => x.style + ':' + x.p).join(', ') + ')');
  ok(r.every(x => x.ms >= 1000 && x.ms < 3000), 'answer time recorded per card (' + r.map(x => x.ms).join(',') + ')');
  await page.reload(); await tick(1300);
  const r2 = await page.evaluate(() => JSON.parse(localStorage.getItem('cl1.session')).turn.results);
  ok(r2.length === 6 && r2.every(x => x.style && x.ms), 'styles and timings survive kill-and-relaunch');
  ok(errors.length === 0, 'no JS errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await ctx.close();
}

console.log('Badges, scoreboard, highlights');
{
  const { ctx, page, errors, tick } = await fresh();
  await page.click('#mNew');
  await page.locator('#segTimer button[data-v="30"]').click();
  await page.locator('#segRounds button[data-v="1"]').click();
  await page.click('#teamList [data-b="1"]'); await page.click('#teamList [data-b="1"]'); // Blue: Moon -> Bolt -> Crown
  ok(await page.evaluate(() => setup.teams[1].badge) === 3, 'tapping a badge cycles it and saves to setup');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'p-setup.png') });
  await page.click('#startBtn');
  ok(await page.evaluate(() => session.teams.map(t => t.badge).join()) === '0,3', 'badges carried into the game');
  ok(await page.locator('#hoBadge svg').count() === 1, 'handoff shows the team badge');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'p-handoff.png') });
  await page.click('#readyBtn'); await tick(2600);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'p-play.png') });
  for (let i = 0; i < 5; i++) { await tick(900); await page.click('#tapGot'); await tick(450); }
  await tick(4000); await page.click('#tapPass'); await tick(450);
  await tick(31000);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'p-recap.png') });
  const gained = +(await page.textContent('#rcScore'));
  await page.click('#rcNext'); await tick(100);
  ok(await page.locator('#board').isVisible(), 'scoreboard appears after turn 1');
  const marks = await page.locator('#bdRows .brow').first().locator('.tg path').count();
  const fresh_ = await page.locator('#bdRows .brow').first().locator('.tg path.new').count();
  ok(marks === Math.min(gained,100) && fresh_ === Math.min(gained,100), `tally marks match points (${marks} marks, ${gained} points), all new`);
  ok((await page.textContent('#bdRows')).includes(`+${gained} this turn`), 'scoreboard shows what the turn added');
  await tick(3000);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'p-board.png') });
  await page.reload(); await tick(1300);
  await page.click('#mResume');
  ok((await page.textContent('#hoWho')).includes('Blue team'), 'kill on the scoreboard resumes at the next team\'s turn');
  await page.click('#readyBtn'); await tick(2600);
  await tick(1500); await page.click('#tapGot'); await tick(450); await tick(31000);
  await page.click('#rcNext'); await tick(2000);
  ok(await page.locator('#final').isVisible(), 'final screen');
  const hl = await page.locator('#fnHigh .idx .t').allTextContents();
  ok(hl.includes('Fastest guess') && hl.includes('Longest run') && hl.includes('Best turn') && hl.includes('Got away'), 'highlights: ' + hl.join(', '));
  ok(await page.locator('#fnList svg.badge').count() === 2, 'final standings show badges');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'p-final.png'), fullPage:true });
  await page.click('#fnShare'); await tick(200);
  const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  ok(clip.includes('Red team: ') && clip.includes('Fastest guess:'), 'share copies a results summary');
  ok(errors.length === 0, 'no JS errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await ctx.close();
}

console.log('New decks and award');
{
  const { ctx, page, errors } = await fresh();
  const d = await page.evaluate(() => allDecks().filter(x => ['uae','celebrate'].includes(x.id)).map(x => [x.name, x.words.length]));
  ok(d.length === 2 && d.every(([,n]) => n >= 300), 'new decks present with 300+ words: ' + JSON.stringify(d));
  const range = await page.evaluate(() => { session = { log:[{ results:['act','describe','one','hum','sounds'].map(st => ({ ok:true, style:st })) }] };
    const okS = new Set(); session.log.forEach(l => l.results.forEach(r => r.ok && okS.add(r.style))); if (okS.size >= 5) stats.flags.range = 1; return checkAch(); });
  ok(range.includes('Full range'), 'Full range award unlocks');
  ok(errors.length === 0, 'no JS errors');
  await ctx.close();
}

console.log('Landscape screens');
if (SHOTS) {
  const { ctx, page, tick } = await fresh({ width:844, height:390 });
  await page.click('#mNew'); await page.locator('#segRounds button[data-v="1"]').click(); await page.locator('#segTimer button[data-v="30"]').click();
  await page.click('#startBtn'); await page.screenshot({ path: path.join(SHOTS, 'l-handoff.png') });
  await page.click('#readyBtn'); await tick(2600); await page.screenshot({ path: path.join(SHOTS, 'l-play.png') });
  for (let i = 0; i < 4; i++) { await tick(900); await page.click('#tapGot'); await tick(450); }
  await tick(31000); await page.click('#rcNext'); await tick(3000); await page.screenshot({ path: path.join(SHOTS, 'l-board.png') });
  await page.click('#bdNext'); await page.click('#readyBtn'); await tick(2600); await tick(1000); await page.click('#tapPass'); await tick(31000);
  await page.click('#rcNext'); await tick(2500); await page.screenshot({ path: path.join(SHOTS, 'l-final.png') });
  await ctx.close();
}
await browser.close();
console.log(fails ? `\n${fails} failed` : '\nAll feature checks passed'); process.exit(fails ? 1 : 0);
