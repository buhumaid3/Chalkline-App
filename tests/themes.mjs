// v1.2 tests: board themes (unlock, switch, persist, dressing), motion modes, input during card animation, relaunch mid-countdown.
// Run: node tests/themes.mjs
import { chromium } from 'playwright';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PAGE = 'file://' + path.join(ROOT, 'www', 'index.html');
let fails = 0; const ok = (c, m) => { console.log(c ? '  ok  ' : '  FAIL', m); if (!c) fails++; };
const browser = await chromium.launch();
async function fresh(opts = {}){
  const ctx = await browser.newContext({ viewport:{ width:390, height:844 }, reducedMotion: opts.reduce ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.clock.install(); await page.goto(PAGE); await page.clock.runFor(1300);
  await page.evaluate(s => localStorage.setItem('cl1.settings', JSON.stringify(Object.assign({ input:'tap' }, s))), opts.settings || {});
  if (opts.stats) await page.evaluate(st => localStorage.setItem('cl1.stats', JSON.stringify(st)), opts.stats);
  await page.reload(); await page.clock.runFor(1300);
  return { ctx, page, errors, tick: ms => page.clock.runFor(ms) };
}
const board = page => page.evaluate(() => document.documentElement.dataset.board);
const slate = page => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--slate').trim());

console.log('Unlocks and picker');
{
  const { ctx, page, errors, tick } = await fresh();
  ok(await board(page) === 'chalk', 'starts on the classroom chalkboard');
  await page.click('[data-go="settings"]');
  ok(await page.locator('#themeList .tsw.locked').count() === 3, 'three boards locked on a new install');
  await page.click('#themeList [data-t="cork"]'); await tick(100);
  ok(await board(page) === 'chalk' && (await page.textContent('#toast')).includes('Finish 3 games'), 'locked board does not switch and says how to unlock');
  const cases = await page.evaluate(() => {
    const t = id => boardDef(id).test(Object.assign(blankStats(), arguments[0] || {}));
    const mk = o => Object.assign(blankStats(), o);
    return {
      cork: [boardDef('cork').test(mk({ games:2 })), boardDef('cork').test(mk({ games:3 }))],
      garden: [boardDef('garden').test(mk({ daily:{ a:1, b:1 } })), boardDef('garden').test(mk({ daily:{ a:1, b:1, c:0 } }))],
      majlis: [boardDef('majlis').test(mk({ deck:{ uae:[24,10] } })), boardDef('majlis').test(mk({ deck:{ uae:[25,10] } }))],
    };
  });
  ok(cases.cork.join() === 'false,true', 'cork unlocks at 3 finished games');
  ok(cases.garden.join() === 'false,true', 'garden unlocks at 3 daily decks');
  ok(cases.majlis.join() === 'false,true', 'majlis unlocks at 25 UAE & Gulf life cards');
  ok(errors.length === 0, 'no JS errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await ctx.close();
}

console.log('Switching, persistence, set dressing');
{
  const stats = { games:3, daily:{ '2026-10-01':5, '2026-10-02':6, '2026-10-03':7 }, deck:{ uae:[30,20] } };
  const { ctx, page, errors, tick } = await fresh({ stats });
  await page.click('[data-go="settings"]');
  ok(await page.locator('#themeList .tsw.locked').count() === 0, 'all boards unlocked by play');
  const swatchSlates = await page.evaluate(() => [...document.querySelectorAll('#themeList .tsw')].map(el => getComputedStyle(el).getPropertyValue('--slate').trim()));
  ok(new Set(swatchSlates).size === 4, 'each swatch previews its own palette: ' + swatchSlates.join(' '));
  const expect = { cork:'#CDA77A', majlis:'#1E1B38', garden:'#1E3027', chalk:'#1F2A24' };
  for (const id of ['cork','majlis','garden']) {
    await page.click(`#themeList [data-t="${id}"]`);
    ok(await board(page) === id && (await slate(page)).toUpperCase() === expect[id], `switching to ${id} is instant (tokens applied)`);
  }
  await page.click('#themeList [data-t="majlis"]');
  await page.reload(); await tick(1300);
  ok(await board(page) === 'majlis', 'chosen board survives relaunch');
  ok(await page.locator('#menuDress .band').count() === 2 && await page.locator('#menuLights rect.bulb').count() === 10, 'majlis: sadu bands and lanterns on the menu');
  await page.evaluate(() => { settings.board = 'garden'; applyBoard(); });
  ok(await page.locator('#menuDress .canopy').count() === 2 && await page.locator('#menuLights circle.paper').count() === 10, 'garden: canopy and paper lanterns');
  await page.evaluate(() => { settings.board = 'cork'; applyBoard(); });
  ok(await page.locator('#menuDress .checker').count() === 1, 'cork: diner checker strip');
  // play screen never gets set dressing, and the card keeps cream + ink in every theme
  await page.click('#mNew'); await page.click('#startBtn'); await page.click('#readyBtn'); await tick(2600);
  for (const id of ['chalk','cork','majlis','garden']) {
    await page.evaluate(i => { document.documentElement.dataset.board = i; }, id);
    const c = await page.evaluate(() => [getComputedStyle(document.querySelector('#icard')).backgroundColor, getComputedStyle(document.querySelector('#cWord')).color]);
    ok(c[0] === 'rgb(246, 240, 220)' && c[1] === 'rgb(38, 34, 28)', `${id}: card stays cream with ink-black word`);
  }
  ok(await page.locator('#play .dress, #play .canopy, #play .band, #play .checker').count() === 0, 'no set dressing on the play screen');
  ok(errors.length === 0, 'no JS errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await ctx.close();
}

console.log('New board unlock is announced');
{
  const { ctx, page, errors, tick } = await fresh({ stats:{ games:2 }, settings:{ input:'tap' } });
  await page.evaluate(() => localStorage.setItem('cl1.setup', JSON.stringify({ timer:30, rounds:1, teams:[{ name:'Solo', players:'' }] })));
  await page.reload(); await tick(1300);
  await page.click('#mNew'); await page.click('#startBtn'); await page.click('#readyBtn'); await tick(2600);
  await page.click('#tapGot'); await tick(31000); await page.click('#rcNext');
  let seen = false; for (let i = 0; i < 20 && !seen; i++) { await tick(500); seen = (await page.textContent('#toast')).includes('Diner corkboard'); }
  ok(seen, 'finishing the 3rd game shows a "New board: Diner corkboard" award card');
  ok(await page.evaluate(() => document.querySelector('#toast').classList.contains('award')), 'uses the pinned index-card toast');
  ok(errors.length === 0, 'no JS errors');
  await ctx.close();
}

console.log('Motion modes');
{
  let r = await fresh({ reduce:true });
  ok(await r.page.evaluate(() => document.documentElement.dataset.motion) === 'reduced', 'follows the system Reduce Motion setting');
  const dur = await r.page.evaluate(() => { const c = document.querySelector('#icard'); c.classList.add('in'); return getComputedStyle(c).animationDuration; });
  ok(parseFloat(dur) <= 0.002, 'card reveal effectively instant when reduced (' + dur + ')');
  await r.page.evaluate(() => Confetti.run(['#fff']));
  ok(await r.page.evaluate(() => getComputedStyle(document.querySelector('#confetti')).display) === 'none', 'no confetti when reduced');
  await r.page.click('[data-go="settings"]'); await r.page.click('#segMotion [data-v="full"]');
  ok(await r.page.evaluate(() => document.documentElement.dataset.motion) === 'full', '"Full" overrides the system setting');
  await r.ctx.close();
  r = await fresh({ settings:{ input:'tap', motion:'reduced' } });
  ok(await r.page.evaluate(() => document.documentElement.dataset.motion) === 'reduced', '"Reduced" works without the system setting, and persists');
  await r.page.click('#mNew'); await r.page.click('#startBtn'); await r.page.click('#readyBtn');
  await r.tick(300);
  ok(await r.page.evaluate(() => getComputedStyle(document.querySelector('#countN')).opacity) === '1', 'countdown number visible with reduced motion (no scrawl fade)');
  await r.ctx.close();
}

console.log('Input during animation, relaunch mid-countdown');
{
  const { ctx, page, errors, tick } = await fresh();
  await page.click('#mNew'); await page.click('#startBtn'); await page.click('#readyBtn'); await tick(2600);
  await page.click('#tapGot');
  await tick(381); // next card has just been dealt; its 160 ms reveal is running now
  const mid = await page.evaluate(() => ({ animating: document.querySelector('#icard').classList.contains('in'), locked }));
  await page.click('#tapGot');
  const n = await page.evaluate(() => session.turn.results.length);
  ok(mid.animating && !mid.locked && n === 2, 'a tap fired mid-reveal is counted (' + n + ' results)');
  await page.evaluate(() => { stats.games = 3; saveStats(); settings.board = 'cork'; saveSettings(); applyBoard(); });
  await page.click('#pauseBtn'); await page.click('#resumeBtn'); await tick(900); // kill during the countdown
  await page.reload(); await tick(1300);
  ok(await board(page) === 'cork', 'board still applied after relaunch');
  await page.click('#mResume'); await page.click('#readyBtn'); await tick(2600);
  ok(await page.locator('#play').isVisible() && await page.evaluate(() => session.turn.results.length) === 2, 'relaunch mid-countdown resumes the turn with results intact');
  ok(errors.length === 0, 'no JS errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await ctx.close();
}
await browser.close();
console.log(fails ? `\n${fails} failed` : '\nAll theme and motion checks passed'); process.exit(fails ? 1 : 0);
