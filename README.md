# Chalkline

Charades for game night. Single-file HTML/JS game in a Capacitor 8 iOS shell, built on Codemagic. No Mac needed.

## What's in the repo

| Path | What it is |
|---|---|
| `src/index.template.html` | The game: all HTML, CSS and JS |
| `src/words-*.txt` | Word bank: 18 decks (14 English, 4 Arabic), 5,685 words, each tagged easy/medium/hard |
| `tools/build.py` | Builds `www/index.html` (app) and `preview/index.html` (web preview); fails if the contrast audit fails |
| `tools/themes.py` | Board themes: every colour token per theme, plus the WCAG contrast audit (report in `docs/contrast-report.txt`) |
| `www/` | What ships in the app: built game, bundled fonts, Capacitor core, sync config |
| `supabase/schema.sql` | Optional sync backend: one table, one function |
| `codemagic.yaml`, `scripts/ci-ios.sh` | CI: generate iOS project, patch it, sign, upload to TestFlight |
| `assets/` | 1024 icon and splash (a blank slate board, so the launch intro starts from it seamlessly), turned into iOS assets during CI |
| `tests/` | Smoke, v1.1 features, v1.2 themes and motion, v1.3 Arabic, v1.4 launch intro, two-device sync, plus `perf.mjs` (frame times, not part of `npm test`) |
| `docs/privacy.html` | Privacy policy for the App Store listing |

To edit words: change `src/words-*.txt`, run `python3 tools/build.py`, commit. The build prints per-deck counts and flags duplicates.

## One-time setup

### 1. Apple (developer.apple.com and App Store Connect)
1. Certificates, Identifiers & Profiles > Identifiers > register an App ID with your bundle ID (for example `com.buhumaid.chalkline`). No extra capabilities needed.
2. App Store Connect > Apps > New App: platform iOS, name **Chalkline** (if taken, try "Chalkline: Charades"), same bundle ID, SKU `chalkline`.
3. Note the app's numeric **Apple ID** (App Information page). It goes into `codemagic.yaml`.

### 2. Repo
This repo is already set up with the bundle ID `com.buhumaid3.chalkline` and the Codemagic key `Codemagic CI`. Build numbers come from Codemagic's own counter, so no Apple ID is needed. To change either value, edit `capacitor.config.json` and `codemagic.yaml`.

### 3. Sync (optional, recommended)
Without it the game is fully offline and keeps progress on the device. To turn on cross-device sync:
1. Create a Supabase project (free tier).
2. SQL Editor > New query > paste `supabase/schema.sql` > Run.
3. Project Settings > API: copy the **Project URL** and the **publishable** key (or the legacy anon key). Never the secret / service_role key.
4. Put both in `www/supabase-config.js`, commit, push.

### 4. Codemagic
1. Add the `Chalkline-App` repo. It picks up `codemagic.yaml` (workflow "Chalkline iOS to TestFlight").
2. The workflow uses your existing App Store Connect API key integration and fetches signing automatically.
3. Start a build. It lands in TestFlight. After that, every push to `main` builds automatically.

### 5. Privacy policy URL
Repo Settings > Pages > Deploy from branch `main`, folder `/docs`. Your URL is `https://<user>.github.io/Chalkline-App/privacy.html`.

## App Store Connect answers (suggested, check them yourself)
- Age rating: answer "None" to every content question. There's no mature content in the app.
- Privacy label: with sync off, "Data Not Collected". With sync on, "Gameplay Content", not linked to the user, not used for tracking.
- No in-app purchases, no ads.

## What's new in 1.4
- Launch intro: chalk writes "Chalkline" letter by letter on a blank board, swooshes the underline and puffs chalk dust, then the board crossfades into the player's theme as the menu cards deal in.
  - First launch about 2.1 s; later launches about 0.9 s; Reduce Motion is a 250 ms fade; a saved game skips straight to Resume with a 200 ms fade.
  - A tap anywhere (or Enter, Space, Escape) skips it, and the tap never lands on a menu button.
  - Cold start only: it never replays when returning to the menu or coming back from the background.
- The native splash is now a blank slate board (Apple's guidance is no text or logos on launch screens, and a launch screen that matches the first screen). The intro's first frame matches it with zero pixel difference.
- If the script ever fails to run, the intro overlay hides itself after 5 s (CSS failsafe), so the app can't get stuck behind it.
- `node tests/intro-frames.mjs <dir>` records real-time frame strips of the intro (every 100 ms).

## What's new in 1.3
- Four Arabic decks, 307–315 words each: حيوانات (animals), أكل وشرب (food & drink), مثّلها (act it out), الإمارات والخليج (Gulf life). Words are written for a UAE/Gulf crowd; native review is still pending.
- Arabic words play right-to-left on the card in Cairo Black (bundled font, Arabic letters only, loaded only when Arabic text appears; SIL Open Font License in `www/fonts/LICENSE-cairo.txt`).
- Deck picker: All / English / العربية filter; search ignores hamza, alef, taa marbuta and harakat differences.
- Your own decks, team names and player names can be in Arabic.
- The daily deck stays English so everyone gets the same cards.
- Fix: a custom deck with 10–14 words can now start a game on its own (the editor allowed 10, Start required 15).
- The app's menus and buttons are still in English. A full Arabic interface is the next step.

## What's new in 1.2
- Four board themes, unlocked by playing (never bought): Classroom chalkboard, Diner corkboard (3 finished games), Garden party (3 daily decks), Desert-night majlis (25 UAE & Gulf life cards). Pick in Settings > Board; the choice syncs.
- The play card is identical in every theme: cream card, ink-black word.
- Animations: launch deal-in, chalk countdown with eraser, 160 ms card reveal, coloured light tiers at 3/6/10 with a chase at 10, kitchen-timer shake in the last 5 seconds, final-screen confetti and winner stamp, pinned award cards.
- Settings > Animations: Match phone (default), Full, Reduced.
- To change a theme's colours, edit `tools/themes.py` and run `python3 tools/build.py`. The build refuses to finish if any text drops below WCAG AA.

## What's new in 1.1
- Clue styles: each card says Act it, Describe it, One word, Hum it or Sounds only. The last three are worth 1 extra point. Toggle in New game.
- New decks: UAE & Gulf life (318 words) and Celebrations (319 words).
- Team badges, picked in New game by tapping the badge.
- Scoreboard between turns with chalk tally marks.
- End-of-night highlights (fastest guess, longest run, best turn, the one that got away) and Share results.
- New award: Full range.

## Testing on a real phone (first TestFlight build)
- Run Settings > Test tilt. If down and up are swapped, set Tilt direction to Reversed. If it's jumpy or sluggish, change sensitivity.
- Start a turn, force-quit the app mid-turn, reopen: Resume game should return with the score and time left.
- Leave a 120s turn running untouched: the screen must not dim or lock.

## Local commands
```bash
python3 tools/build.py        # rebuild after editing src/
npm run serve                 # play at http://localhost:8080 (tap mode on desktop; arrow keys work too)
npm test                      # smoke + sync tests (needs: npx playwright install chromium)
```
