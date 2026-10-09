# Letterless

A real-time party word game for 3 to 10 friends on their phones. Describe each secret word **without any of its letters** while everyone else races to guess it.

- Game rules: [`docs/SPEC.md`](docs/SPEC.md)
- Approved screens: [`docs/design/`](docs/design)

## How it fits together

| Part | What it does |
|---|---|
| **Website** (`src/`) | The game screens. A static site built with Vite + React, hosted on Netlify. |
| **Database** (`supabase/migrations/`) | Rooms, agents, turns, clues, guesses and scores. Row Level Security means each phone can only *read* its own room. |
| **Referee** (`supabase/functions/referee/`) | A Supabase Edge Function that handles every move. It checks the rules and the profanity filter, and keeps the secret word. |
| **Shared rules** (`supabase/functions/_shared/`) | Letter rules and the profanity filter. The website uses them for instant feedback; the referee uses the same code for the real check. |

**Anti-cheat:** the secret word sits in a table that only that turn's clue-giver can read. Guessers' phones only ever get the word's *length*, until it is cracked, passed or the turn ends.

**Timing:** the server stores each phase's deadline. When a timer runs out, phones nudge the referee, which moves the game on exactly once.

## 1. Run it on your computer

You need [Node.js 22](https://nodejs.org) (LTS).

```bash
npm install
cp .env.example .env      # already holds the project URL and publishable key
npm run dev
```

Open http://localhost:5173. **Each browser tab is a separate agent**, so open three or more tabs to play a game against yourself. On your phone (same Wi-Fi), open the "Network" address that `npm run dev` prints.

Tests:

```bash
npm test                   # rules, profanity filter and word list
npx playwright install chromium   # first time only
npm run e2e                # a full 4-player game in 5 browser "phones" against the live Supabase project
```

## 2. Set up Supabase (one time, or after changing the database or referee)

The project is `lerpkitubxuoyjtoeiwy`.

1. **Log the command-line tool in.** This opens your browser to approve:
   ```bash
   npx supabase login
   ```
2. **Connect this folder to the project.** If it asks for the database password, find or reset it under *Project Settings > Database*:
   ```bash
   npx supabase link --project-ref lerpkitubxuoyjtoeiwy
   ```
3. **Create the tables and load the 500 words:**
   ```bash
   npx supabase db push
   ```
4. **Deploy the referee:**
   ```bash
   npx supabase functions deploy referee --no-verify-jwt
   ```
   `--no-verify-jwt` is correct. The referee checks each player's session itself, which is the approach Supabase recommends for the new API keys.
5. **Turn on anonymous sign-ins.** Players don't need accounts; each phone gets an anonymous session. In the dashboard, open *Authentication > Sign In / Providers* and switch on **Allow anonymous sign-ins**.

### Changing the word list or the banned words

1. Edit `data/words.csv` or `data/banned-words-en.txt`.
2. Run `npm run gen`.
3. For word changes, also run `npx supabase db push`. For banned-word changes, also redeploy the referee (step 4 above).

To push a changed seed file, rename it with a newer date first, for example `20261101000000_seed_words.sql`.

### Free-plan note

Supabase pauses free projects after about a week with no activity. If the game says it can't reach the server, open the Supabase dashboard and click **Restore project**.

## 3. Put it online with Netlify

1. In Netlify, choose **Add new site > Import an existing project > GitHub**, then pick the `letterless` repository.
2. The build settings come from `netlify.toml`: build command `npm run build`, publish directory `dist`.
3. Before the first deploy, open **Site configuration > Environment variables** and add:
   - `VITE_SUPABASE_URL` = `https://lerpkitubxuoyjtoeiwy.supabase.co`
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = the publishable key (starts with `sb_publishable_`)
4. Click **Deploy**. Every push to GitHub now redeploys automatically.
5. Optional: in Supabase, set *Authentication > URL Configuration > Site URL* to your Netlify address.

Never put the **secret** or **service_role** key in Netlify or in the code. The referee gets the secret key automatically inside Supabase.

## Project layout

```
src/                     website (React)
  App.tsx                picks the screen for the room's state
  lib/                   Supabase client, referee calls, server clock, live room state
  screens/               Home, WaitingRoom, ClueGiverTurn, GuesserTurn, BetweenTurns, Debrief
supabase/
  migrations/            database tables, security rules, game logic (ll_* functions), word list
  functions/referee/     the referee edge function
  functions/_shared/     rules + profanity filter (shared with the website)
data/                    words.csv and banned-words-en.txt (sources for the generated files)
scripts/                 generators for the word seed and banned-words module
tests/                   unit tests and the Playwright multiplayer test
docs/                    brief, spec and design references
```

## Rules decisions made during the build

- **Turn order** is the order agents joined. **Rounds** default to 2 and turn length to 60s.
- **Clues** open after the 3-second briefing. The clue-giver may pass during the briefing.
- **Between turns** is a single 5-second screen: the turn report plus the next agent's GET READY countdown.
- A **word still on screen** when time runs out is shown as "unsolved" in the turn report.
- **Leaving:**
  - If the clue-giver leaves mid-turn, their turn ends immediately.
  - If fewer than 2 agents remain, the game ends and goes to the debrief.
  - An agent who has been silent for over 60 seconds when their turn comes up is treated as having left. If they come back, they get their seat back.
- **Lost tab:** an agent who closes their tab can rejoin with the same codename once their old seat has been quiet for 60 seconds.
- **Play again** sends everyone, including spectators, back to the waiting room with the same settings, so the host can tweak them and press Begin mission.
- **Codenames** are blocked if they exactly match any banned word, or contain one of the strongest words. That list is `STRONGEST_WORDS` in `supabase/functions/_shared/profanity.ts`.
- **Leaderboard ties** share a rank. Within a tie, rows are ordered by most words Cracked.
