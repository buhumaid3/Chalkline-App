// v1.3 Arabic tests: decks, Cairo font loading, right-to-left card, folded search, language filter,
// Arabic custom decks, daily deck stays English, relaunch mid-turn on an Arabic deck.
// Run: node tests/arabic.mjs
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PAGE = 'file://' + path.join(ROOT, 'www', 'index.html');
const SHOTS = process.env.SHOTS || '';
let fails = 0; const ok = (c, m) => { console.log(c ? '  ok  ' : '  FAIL', m); if (!c) fails++; };
const browser = await chromium.launch();
async function fresh(viewport = { width:390, height:844 }, setup){
  const ctx = await browser.newContext({ viewport, deviceScaleFactor:2 });
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(PAGE); await page.waitForTimeout(700);
  await page.evaluate(su => { localStorage.setItem('cl1.settings', JSON.stringify({ input:'tap' }));
    if (su) localStorage.setItem('cl1.setup', JSON.stringify(su)); }, setup || null);
  await page.reload(); await page.waitForTimeout(1300);
  return { ctx, page, errors };
}
const AR = ['ar_animals','ar_food','ar_actions','ar_gulf'];

console.log('Decks');
{
  const { ctx, page, errors } = await fresh();
  const d = await page.evaluate(ids => ids.map(id => { const x = deckById(id); return [id, x.words.length, x.words.every(w => isArabic(w[0])), [1,2,3].map(t => x.words.filter(w => w[1] === t).length)]; }), AR);
  d.forEach(([id, n, all, tiers]) => ok(n >= 300 && all && tiers.every(c => c >= 80), `${id}: ${n} words, all Arabic, easy/medium/hard ${tiers.join('/')}`));
  const daily = await page.evaluate(() => dailyDeck('2026-10-20').some(k => k.startsWith('ar_')));
  ok(!daily, 'daily deck stays English (same cards for everyone)');
  const styles = await page.evaluate(() => [stylePool('ar_animals').includes('sounds'), stylePool('ar_food').includes('sounds'), stylePool('ar_food').includes('hum')]);
  ok(styles.join() === 'true,false,false', 'clue styles follow the deck (sounds for animals, not for food)');
  ok(errors.length === 0, 'no JS errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await ctx.close();
}

console.log('Picker: search and language filter');
{
  const { ctx, page, errors } = await fresh();
  await page.click('#mNew'); await page.click('#openPicker');
  ok(await page.locator('#deckSearch').getAttribute('dir') === 'auto', 'search box accepts right-to-left typing');
  await page.fill('#deckSearch', 'اسد'); // typed without hamza; deck has "أسد"
  ok((await page.locator('#deckList .nm').allTextContents()).some(n => n.startsWith('حيوانات')), 'search folds hamza: "اسد" finds the animals deck');
  await page.fill('#deckSearch', 'قطه'); // taa marbuta typed as haa
  ok((await page.locator('#deckList .nm').allTextContents()).some(n => n.startsWith('حيوانات')), 'search folds taa marbuta: "قطه" finds "قطة"');
  await page.fill('#deckSearch', '');
  await page.click('#deckLang [data-v="ar"]');
  const names = await page.locator('#deckList .nm').allTextContents();
  ok(names.length === 4 && names.every(n => /[؀-ۿ]/.test(n)), 'العربية filter shows only the 4 Arabic decks');
  const before = await page.evaluate(() => setup.decks.slice());
  await page.click('#pickAll');
  const after = await page.evaluate(() => setup.decks.slice());
  ok(before.every(id => after.includes(id)) && ['ar_animals','ar_food','ar_actions','ar_gulf'].every(id => after.includes(id)), 'Select all adds the Arabic decks and keeps English picks');
  await page.click('#pickNone');
  const cleared = await page.evaluate(() => setup.decks.slice());
  ok(cleared.join() === before.join(), 'Clear removes only the decks in view');
  await page.click('#deckLang [data-v="en"]');
  ok((await page.locator('#deckList .nm').count()) === 14, 'English filter shows the 14 English decks');
  if (SHOTS) { await page.click('#deckLang [data-v="ar"]'); await page.fill('#deckSearch', 'كبسه'); await page.waitForTimeout(200); await page.screenshot({ path: path.join(SHOTS, 'picker-ar.png') }); }
  ok(errors.length === 0, 'no JS errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await ctx.close();
}

console.log('Play: right-to-left card in Cairo, relaunch');
{
  const { ctx, page, errors } = await fresh({ width:844, height:390 }, { timer:60, rounds:1, tier:'W', decks:['ar_food'], teams:[{ name:'الصقور', players:'' },{ name:'Blue team', players:'' }] });
  await page.click('#mNew'); await page.click('#startBtn'); await page.click('#readyBtn'); await page.waitForTimeout(2800);
  const c = await page.evaluate(async () => { const el = document.querySelector('#cWord'); await document.fonts.ready;
    return { text: el.textContent, dir: el.dir, lang: el.lang, ar: el.classList.contains('ar'), weight: getComputedStyle(el).fontWeight,
      cairo: document.fonts.check('900 40px "CL Arabic"', el.textContent),
      loaded: [...document.fonts].some(f => f.family.replace(/"/g,'') === 'CL Arabic' && f.status === 'loaded'),
      fits: el.scrollWidth <= el.parentElement.clientWidth && el.scrollHeight <= el.parentElement.clientHeight }; });
  ok(/[؀-ۿ]/.test(c.text), 'card shows an Arabic word: ' + c.text);
  ok(c.dir === 'rtl' && c.lang === 'ar' && c.ar && c.weight === '900', 'card is right-to-left, lang=ar, Cairo Black');
  ok(c.cairo && c.loaded, 'bundled Cairo font loaded (not a system fallback)');
  ok(c.fits, 'word fits the card');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'play-ar-l.png') });
  await page.click('#tapGot'); await page.waitForTimeout(450); await page.click('#tapPass'); await page.waitForTimeout(450);
  await page.reload(); await page.waitForTimeout(1300);
  await page.click('#mResume'); await page.click('#readyBtn'); await page.waitForTimeout(2800);
  const r = await page.evaluate(() => ({ n: session.turn.results.length, ar: session.turn.results.every(x => isArabic(x.w)), dir: document.querySelector('#cWord').dir }));
  ok(r.n === 2 && r.ar && r.dir === 'rtl', 'kill-and-relaunch mid-turn resumes on the Arabic deck');
  await page.click('#pauseBtn'); await page.click('#endTurnBtn');
  ok(await page.locator('#rcList .w[dir="auto"]').count() === 2, 'recap words carry dir="auto"');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'recap-ar-l.png') });
  ok(errors.length === 0, 'no JS errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await ctx.close();
}

console.log('Portrait screens');
{
  const { ctx, page, errors } = await fresh(undefined, { timer:60, rounds:1, tier:'W', decks:['ar_gulf','ar_actions'], teams:[{ name:'الصقور', players:'' },{ name:'النمور', players:'' }] });
  await page.click('#mNew'); await page.click('#startBtn');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'handoff-ar-p.png') });
  await page.click('#readyBtn'); await page.waitForTimeout(2800);
  // longest Arabic entry in these decks must still fit
  const fit = await page.evaluate(() => { const el = document.querySelector('#cWord'); let worst = '', ok = true;
    ['ar_gulf','ar_actions'].forEach(id => deckById(id).words.forEach(([w]) => { if (w.length > worst.length) worst = w; }));
    el.textContent = worst; el.dir = 'rtl'; el.classList.add('ar'); fitWord(el);
    return { worst, fits: el.scrollWidth <= el.parentElement.clientWidth && el.scrollHeight <= el.parentElement.clientHeight, size: parseFloat(el.style.fontSize) }; });
  ok(fit.fits && fit.size >= 28, `longest entry "${fit.worst}" fits at ${Math.round(fit.size)}px`);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'play-ar-p-long.png') });
  await page.evaluate(() => nextCard()); await page.waitForTimeout(400);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'play-ar-p.png') });
  ok(errors.length === 0, 'no JS errors');
  await ctx.close();
}

console.log('Arabic custom deck');
{
  const { ctx, page, errors } = await fresh();
  await page.click('[data-go="decks"]'); await page.click('#newDeck');
  ok(await page.locator('#edWords').getAttribute('dir') === 'auto', 'word list accepts right-to-left typing');
  await page.fill('#edName', 'العائلة');
  await page.fill('#edWords', ['جدتي','عمي سالم','رحلة العين','عزيمة الجمعة','كبسة أمي','سيارة أبوي','بيت الجد','عيد الفطر في البيت','قروب العائلة','ضحكة خالتي','مشوار البحر'].join('\n'));
  await page.click('#edSave'); await page.waitForTimeout(300);
  const id = await page.evaluate(() => customDecks()[0].id);
  ok(await page.evaluate(i => isArDeck(i), id), 'deck with Arabic words is grouped under العربية');
  await page.evaluate(i => { setup.decks = [i]; setup.tier = 'W'; setup.timer = 60; saveSetup(); }, id);
  await page.evaluate(() => { renderMenu(); show('menu'); }); await page.click('#mNew'); await page.click('#startBtn'); await page.click('#readyBtn'); await page.waitForTimeout(2800);
  ok(await page.evaluate(() => document.querySelector('#cWord').dir) === 'rtl', 'custom Arabic words play right-to-left');
  ok(errors.length === 0, 'no JS errors');
  await ctx.close();
}
await browser.close();
console.log(fails ? `\n${fails} failed` : '\nAll Arabic checks passed'); process.exit(fails ? 1 : 0);
