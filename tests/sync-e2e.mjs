// End-to-end sync test: two "devices" (browser contexts) run the real game against the real
// SQL in supabase/schema.sql (executed by PGlite), via the same /rest/v1/rpc HTTP path Supabase exposes.
// Run: node tests/sync-e2e.mjs
import { chromium } from 'playwright';
import { PGlite } from '@electric-sql/pglite';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let fails = 0; const ok = (c, m) => { console.log(c ? '  ok  ' : '  FAIL', m); if (!c) fails++; };

const db = new PGlite();
await db.exec('create role anon nologin; create role authenticated nologin;');
await db.exec(fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8'));

const types = { '.html':'text/html', '.js':'text/javascript', '.woff2':'font/woff2' };
const server = http.createServer(async (req, res) => {
  if (req.url.startsWith('/rest/v1/rpc/chalkline_push')) {
    if (req.headers.apikey !== 'sb_publishable_test') { res.writeHead(401); return res.end('{}'); }
    let body = ''; for await (const c of req) body += c;
    try {
      const a = JSON.parse(body);
      await db.exec('set role anon');
      const r = await db.query('select public.chalkline_push($1,$2,$3,$4) as d', [a.p_key, a.p_device, a.p_slice, a.p_decks]);
      await db.exec('reset role');
      res.writeHead(200, { 'Content-Type':'application/json' }); return res.end(JSON.stringify(r.rows[0].d));
    } catch (e) { await db.exec('reset role'); res.writeHead(400); return res.end(JSON.stringify({ message:e.message })); }
  }
  if (req.url === '/supabase-config.js') { res.writeHead(200, { 'Content-Type':'text/javascript' }); return res.end(`window.CHALKLINE_SUPABASE={url:'http://localhost:${server.address().port}',anonKey:'sb_publishable_test'};`); }
  const f = path.join(ROOT, 'www', decodeURIComponent(req.url.split('?')[0]) === '/' ? 'index.html' : req.url.split('?')[0]);
  if (!f.startsWith(path.join(ROOT, 'www')) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, r));
const URL0 = `http://localhost:${server.address().port}/index.html`;

const browser = await chromium.launch();
async function device(){
  const ctx = await browser.newContext({ viewport:{ width:390, height:844 } }); const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(URL0); await page.waitForTimeout(2600); // includes startup sync
  return { ctx, page, errors };
}
const A = await device(), B = await device();
ok(await A.page.evaluate(() => Sync.state) === 'ok', 'device A synced on startup');

// A plays a quick game and makes a deck
await A.page.evaluate(() => { stats.correct = 40; stats.games = 3; stats.bestStreak = 6; saveStats(); });
await A.page.click('[data-go="decks"]'); await A.page.click('#newDeck');
await A.page.fill('#edName', 'Family names');
await A.page.fill('#edWords', Array.from({ length:12 }, (_, i) => 'Cousin ' + (i + 1)).join('\n'));
await A.page.click('#edSave'); await A.page.waitForTimeout(800);
const codeA = await A.page.evaluate(() => Sync.key());

// B has its own progress, then links to A's code
await B.page.evaluate(() => { stats.correct = 15; stats.games = 1; stats.bestStreak = 9; saveStats(); });
await B.page.click('[data-go="settings"]');
await B.page.fill('#otherCode', codeA.toLowerCase().replace(/(.{4})/g, '$1 ')); // messy input on purpose
await B.page.click('#useCode'); await B.page.click('#askYes'); await B.page.waitForTimeout(1200);
ok(await B.page.evaluate(() => Sync.key()) === codeA, 'B now uses A\'s code (input normalized)');
const mB = await B.page.evaluate(() => { const m = merged(); return { correct:m.correct, games:m.games, best:m.bestStreak }; });
ok(mB.correct === 55 && mB.games === 4 && mB.best === 9, `B sees combined stats: ${JSON.stringify(mB)}`);
ok(await B.page.evaluate(() => customDecks().some(d => d.name === 'Family names' && d.words.length === 12)), 'B received A\'s custom deck');

// A syncs again and sees B's progress
await A.page.evaluate(() => { renderSettings(); show('settings'); }); await A.page.click('#syncNow'); await A.page.waitForTimeout(1000);
const mA = await A.page.evaluate(() => merged().correct);
ok(mA === 55, 'A sees B\'s progress after syncing (' + mA + ')');

// B deletes the deck, A gets the tombstone
await B.page.evaluate(async () => { const all = store.get('decks', {}); const id = Object.keys(all)[0]; all[id] = { ...all[id], words:[], del:true, u:Date.now() }; store.set('decks', all); invalidateDecks(); await Sync.run('deck'); });
await A.page.click('#syncNow'); await A.page.waitForTimeout(1000);
ok(await A.page.evaluate(() => customDecks().length) === 0, 'deck deletion propagates');

// board choice syncs: A unlocks and picks Garden party, B adopts it (unlock comes from combined stats)
await A.page.evaluate(async () => { stats.daily = { '2026-10-01':3, '2026-10-02':4, '2026-10-03':5 }; saveStats(); setBoard('garden'); await new Promise(r => setTimeout(r, 900)); });
await B.page.evaluate(() => { renderSettings(); show('settings'); }); await B.page.click('#syncNow'); await B.page.waitForTimeout(1000);
ok(await B.page.evaluate(() => document.documentElement.dataset.board) === 'garden', 'board choice syncs to the other device');
await B.page.reload(); await B.page.waitForTimeout(2600);
ok(await B.page.evaluate(() => document.documentElement.dataset.board) === 'garden', 'synced board persists after relaunch');
await A.page.evaluate(() => { renderSettings(); show('settings'); });

// server down: game keeps working, status says so
server.close(); server.closeAllConnections && server.closeAllConnections();
await A.page.click('#syncNow'); await A.page.waitForTimeout(1500);
ok(await A.page.evaluate(() => Sync.state) === 'error', 'unreachable server reported, not thrown');
ok((await A.page.textContent('#syncStatus')).includes('safe on this device'), 'status explains progress is safe locally');
ok(A.errors.length === 0 && B.errors.length === 0, 'no JS errors' + (A.errors.concat(B.errors).length ? ': ' + A.errors.concat(B.errors).join(' | ') : ''));
await browser.close();
console.log(fails ? `\n${fails} failed` : '\nAll sync checks passed'); process.exit(fails ? 1 : 0);
