// v1.4.1 tilt + orientation tests, with simulated motion on a controlled clock.
// Pose model: phi = degrees the screen is tipped toward the ceiling from vertical (negative = toward the floor).
// c = the platform's face-up sign (z when the screen faces the sky): iOS reports -1, the spec says +1; both are tested.
// side = which landscape side (+1 / -1), or 0 for portrait.
// Run: node tests/tilt.mjs
import { chromium } from 'playwright';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PAGE = 'file://' + path.join(ROOT, 'www', 'index.html');
let fails = 0; const ok = (c, m) => { console.log(c ? '  ok  ' : '  FAIL', m); if (!c) fails++; };
const browser = await chromium.launch();

async function setup({ c = -1, side = 1, viewport = { width:844, height:390 }, settings = {}, rounds = 1, mode = 'classic' } = {}){
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.clock.install();
  await page.goto(PAGE); await page.clock.runFor(2600);
  await page.evaluate(([st, r, md]) => {
    localStorage.setItem('cl1.settings', JSON.stringify(Object.assign({ input:'auto' }, st)));
    localStorage.setItem('cl1.setup', JSON.stringify({ mode:md, timer:60, rounds:r, styles:false, teams:[{ name:'A', players:'Ann, Bo, Cy' },{ name:'B', players:'' }] }));
    localStorage.setItem('cl1.introSeen', 'true');
  }, [settings, rounds, mode]);
  await page.reload(); await page.clock.runFor(1500);
  await page.evaluate(([c, side]) => {
    window.__pose = { phi:0, c, side, extra:0, on:true };
    setInterval(() => {
      const p = window.__pose; if (!p.on) return;
      const r = p.phi * Math.PI / 180, g = 9.81;
      const z = p.c * g * Math.sin(r), lat = g * Math.cos(r);
      const a = p.side === 0 ? { x:0, y:lat, z } : { x:p.side * lat, y:0, z };
      a.x += p.extra; // linear jolt along the long axis
      window.dispatchEvent(new DeviceMotionEvent('devicemotion', { accelerationIncludingGravity:a }));
    }, 16);
  }, [c, side]);
  const pose = (phi, extra = 0) => page.evaluate(([f, e]) => { window.__pose.phi = f; window.__pose.extra = e; }, [phi, extra]);
  const tick = ms => page.clock.runFor(ms);
  const results = () => page.evaluate(() => session && session.turn ? session.turn.results.map(r => r.ok ? 'G' : 'P').join('') : '');
  return { ctx, page, errors, pose, tick, results };
}
// start a turn: phone in hand at Ready (screen toward the player), then onto the forehead for the countdown
async function startTurn(t, { handPhi = 50, foreheadPhi = 0 } = {}){
  await t.pose(handPhi);
  await t.page.click('#mNew'); await t.page.click('#startBtn'); await t.page.click('#readyBtn');
  await t.tick(500); await t.pose(foreheadPhi); await t.tick(2600);
}
async function nod(t, phi, hold = 250, back = 0, rest = 500){ await t.pose(phi); await t.tick(hold); await t.pose(back); await t.tick(rest); }

console.log('Directions on both landscape sides and both platform sign conventions');
for (const [c, side] of [[-1, 1], [-1, -1], [1, 1], [1, -1]]) {
  const t = await setup({ c, side });
  await startTurn(t);
  ok(await t.page.evaluate(() => Tilt.faceUp) === c, `c=${c}: face-up sign read at Ready`);
  await nod(t, -40); await nod(t, 40); await nod(t, -40);
  ok(await t.results() === 'GPG', `c=${c} side=${side > 0 ? 'left' : 'right'}: down, up, down gives Got it, Pass, Got it (${await t.results()})`);
  ok(t.errors.length === 0, 'no JS errors' + (t.errors.length ? ': ' + t.errors.join(' | ') : ''));
  await t.ctx.close();
}

console.log('Angled start, slow and fast nods, holds, jitter');
{
  const t = await setup({ settings:{ sens:'low' } });
  await startTurn(t, { foreheadPhi:35 }); // tipped back 35 degrees: with the old raw-z reading, "up" was unreachable on Firm
  ok(Math.abs(await t.page.evaluate(() => Tilt.neutral) - (-35)) < 3, 'start position calibrated to the tipped-back pose');
  await nod(t, 75, 250, 35); await nod(t, -10, 250, 35);
  ok(await t.results() === 'PG', `tipped-back start, Firm: up and down both register (${await t.results()})`);
  await t.ctx.close();
}
{
  const t = await setup();
  await startTurn(t);
  for (let k = 0; k <= 10; k++) { await t.pose(-4 * k); await t.tick(80); } // slow nod over 800 ms
  await t.tick(300); await t.pose(0); await t.tick(500);
  ok(await t.results() === 'G', `slow nod counts once (${await t.results()})`);
  await nod(t, 45, 90, 0, 400);
  ok(await t.results() === 'GP', `fast 90 ms nod counts (${await t.results()})`);
  await nod(t, -45, 30, 0, 400);
  ok(await t.results() === 'GP', `30 ms spike ignored (${await t.results()})`);
  await t.pose(-40); await t.tick(3000); await t.pose(0); await t.tick(500);
  ok(await t.results() === 'GPG', `holding tilted for 3 s counts once (${await t.results()})`);
  ok(t.errors.length === 0, 'no JS errors');
  await t.ctx.close();
}
{
  const t = await setup({ settings:{ sens:'high' } }); // Light: 22 degrees
  await startTurn(t);
  await t.pose(-35); await t.tick(250); await t.pose(-25); await t.tick(2000); await t.pose(0); await t.tick(600);
  ok(await t.results() === 'G', `slow nod held at 25 degrees then back up: no extra Pass (old bug) (${await t.results()})`);
  await t.ctx.close();
}
{
  const t = await setup();
  await startTurn(t);
  for (let k = 0; k < 150; k++) { await t.pose(((k * 37) % 17) - 8, (k % 5 === 0) ? 4 : 0); await t.tick(20); } // head jitter +-8 deg, walking jolts
  ok(await t.results() === '', `3 s of jitter and walking jolts: no answers (${await t.results()})`);
  for (let k = 0; k < 20; k++) { await t.pose(-45, 7); await t.tick(16); await t.pose(0, -7); await t.tick(16); } // violent shaking
  await t.tick(400);
  ok((await t.results()).length <= 1, `violent shaking: at most one answer (${await t.results()})`);
  await t.ctx.close();
}

console.log('Only active while a card is live');
{
  const t = await setup({ mode:'relay' });
  await t.pose(50);
  await t.page.click('#mNew'); await t.page.click('#startBtn'); await t.page.click('#readyBtn');
  await t.tick(500); await t.pose(0); await t.tick(800);
  await nod(t, -45, 300, 0, 300); // during the countdown
  await t.tick(1200);
  ok(await t.results() === '', 'tilting during the countdown does nothing');
  await nod(t, -40); await nod(t, -40); await nod(t, -40, 250, 0, 350); // third right answer starts the relay handoff (420 ms after it)
  ok(await t.page.evaluate(() => document.querySelector('#relay').classList.contains('on')), 'relay handoff showing');
  await nod(t, 45, 300, 0, 300);
  ok(await t.results() === 'GGG', `tilting during the relay handoff does nothing (${await t.results()})`);
  await t.tick(2600); await t.page.click('#pauseBtn');
  await nod(t, -45, 300, 0, 300);
  ok(await t.results() === 'GGG', 'tilting while paused does nothing');
  await t.page.click('#endTurnBtn');
  await nod(t, -45, 300, 0, 300);
  ok(await t.results() === 'GGG' && await t.page.evaluate(() => current) === 'recap', 'tilting on the recap does nothing');
  await t.ctx.close();
}

console.log('Reversed, sensor loss, face-up learning');
{
  const t = await setup({ settings:{ flip:true } });
  await startTurn(t);
  await nod(t, -40); await nod(t, 40);
  ok(await t.results() === 'PG', `Reversed: down is Pass, up is Got it (${await t.results()})`);
  await t.page.evaluate(() => { window.__pose.on = false; }); await t.tick(1700);
  ok(await t.page.evaluate(() => !document.querySelector('#play').classList.contains('tilt')), 'sensor stops mid-turn: tap buttons appear');
  ok((await t.page.textContent('#toast')).includes('motion sensor stopped'), 'and it says why');
  await t.page.click('#tapGot'); await t.tick(500);
  ok(await t.results() === 'PGG', 'tap buttons work after the switch');
  await t.ctx.close();
}
{
  const t = await setup({ c:1 });
  await t.page.evaluate(() => { localStorage.setItem('cl1.faceUp', '-1'); Tilt.faceUp = -1; Tilt.faceHow = 'default'; Tilt.listen(); });
  await t.pose(88); await t.tick(2500); // lying screen-up on the table in the menu, on a platform where face-up z is positive
  ok(await t.page.evaluate(() => [Tilt.faceUp, Tilt.faceHow].join()) === '1,learned', 'face-up sign learned from the phone lying on the table between turns');
  await t.pose(0);
  await t.page.click('#mNew'); await t.page.click('#startBtn'); await t.page.click('#readyBtn'); await t.tick(500); await t.tick(2600); // Ready held upright: no quick read
  await nod(t, -40); await nod(t, 40);
  ok(await t.results() === 'GP', `learned sign gives the right directions (${await t.results()})`);
  await t.ctx.close();
}

console.log('Orientation');
{
  const t = await setup({ viewport:{ width:390, height:844 }, side:0, settings:{ input:'tap' } });
  const calls = [];
  await t.page.exposeFunction('__orientCall', (k, v) => calls.push(k + ':' + v));
  await t.page.evaluate(() => { Orient.plugin = () => ({ lock: o => { window.__orientCall('lock', o.orientation); return Promise.resolve(); }, unlock: () => { window.__orientCall('unlock', ''); return Promise.resolve(); } }); });
  await t.page.click('#mNew'); await t.page.click('#startBtn'); await t.page.click('#readyBtn'); await t.tick(300);
  ok(await t.page.locator('#sideways').isVisible(), 'portrait at Ready: "Turn your phone sideways"');
  await t.tick(2000);
  ok(await t.page.evaluate(() => !document.querySelector('#count').classList.contains('on')), 'the turn does not start while portrait');
  await t.page.setViewportSize({ width:844, height:390 }); await t.tick(900);
  ok(!(await t.page.locator('#sideways').isVisible()) && await t.page.evaluate(() => document.querySelector('#count').classList.contains('on')), 'turning sideways starts the countdown');
  ok(calls.includes('lock:landscape-primary'), 'screen locked to the side being held: ' + calls.join(', '));
  await t.tick(2600); await t.page.click('#tapGot'); await t.tick(500);
  await t.page.click('#pauseBtn'); await t.page.click('#endTurnBtn'); await t.tick(200);
  ok(calls[calls.length - 1] === 'unlock:', 'unlocked at the recap');
  await t.page.evaluate(() => Object.defineProperty(screen.orientation, 'angle', { get: () => 270, configurable:true }));
  ok(await t.page.evaluate(() => Orient.type()) === 'landscape-secondary', 'other landscape side maps to landscape-secondary');
  await t.page.setViewportSize({ width:390, height:844 });
  await t.page.click('#rcNext'); await t.page.click('#bdNext'); await t.page.click('#readyBtn'); await t.tick(300);
  await t.page.click('#swUpright'); await t.tick(300);
  ok(await t.page.evaluate(() => document.querySelector('#count').classList.contains('on') && session.upright === true), '"Play upright instead" starts the turn and is remembered for this game');
  ok(calls.includes('lock:portrait-primary'), 'upright turn locks portrait');
  ok(t.errors.length === 0, 'no JS errors' + (t.errors.length ? ': ' + t.errors.join(' | ') : ''));
  await t.ctx.close();
}

console.log('Test tilt diagnostics');
{
  const t = await setup();
  await t.page.click('[data-go="settings"]'); await t.page.click('#testTilt'); await t.tick(300);
  await t.pose(0); await t.tick(1500); await nod(t, -40, 250, 0, 300);
  const d = await t.page.textContent('#tDiag');
  ok(/Sensor\s+\d+ Hz/.test(d) && /Angle/.test(d) && /Face-up\s+-1/.test(d) && /Last\s+Got it at -?\+?\d/.test(d) && /Screen\s+landscape/.test(d), 'diagnostics show rate, angle, face-up sign, screen and last decision');
  ok((await t.page.textContent('#tOut')) === 'Got it', 'test tilt registers a nod');
  console.log(d.split('\n').map(l => '        ' + l).join('\n'));
  await t.ctx.close();
}

await browser.close();
console.log(fails ? `\n${fails} failed` : '\nAll tilt and orientation checks passed'); process.exit(fails ? 1 : 0);
