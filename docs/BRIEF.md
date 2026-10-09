# Letterless — build brief for Claude Code

Build **Letterless**, a real-time multiplayer party word game, following `SPEC.md` exactly.
Players describe a secret word without using any of its letters; everyone else races to guess it.

## What's in this folder
- `SPEC.md` — the agreed game rules (source of truth). Where this brief and the spec differ, the spec wins.
- `words.csv` — the approved 500-word list with difficulty `level` (1–4) = number of distinct letters banned.
- `banned-words-en.txt` — profanity list for codenames, clues and guesses (British additions appended at the end).
- `design/*.png` — the approved phone screens (390×844). Match them closely.
- `design/*.reference.html` — static HTML of each screen, usable as a styling reference (colours, fonts, spacing).

## Stack
- Front end: a static site (Vite + vanilla TS or React is fine — keep it simple), deployed later to **Netlify** from GitHub.
- Back end: **Supabase** (free plan).
  - Project URL: `https://lerpkitubxuoyjtoeiwy.supabase.co`
  - Publishable key: `sb_publishable_veUoa2hYew5uV3b7U9hVdA_dv-5ELid`
  - Read both from environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`) with a `.env.example`; never commit secret keys.
- GitHub repo: `letterless` (already created, empty).

## Architecture requirements
- **Server is the referee.** Use Supabase Edge Functions (+ database) for: creating rooms/case numbers, joining, starting the game, picking words by ladder level, checking guesses, passes, scoring, turn timing, and host handover.
- **Anti-cheat:** the secret word must never be sent to guessers' devices. Only the clue-giver receives it. Guessers get the word length only, and the word is revealed to everyone once cracked.
- Use Supabase Realtime for live clues, guesses and turn/state changes. Late joiners and refreshes must be able to recover state from the database.
- Validate everything server-side (letters-only rules, banned letters in clues, length limits, profanity filter, exact guess matching) — the client checks are for UX only.
- Row Level Security on all tables.

## Key rules (summary — see SPEC.md)
- Rooms: 5-char case number, 3–10 agents, host sets rounds (1/2/3) and turn length (45/60/90s, default 60).
- Codenames: shown as "Agent ___", 2–10 letters, letters only, unique per room (case-insensitive).
- Turn: rapid-fire; first correct guess wins the word, next word appears; one pass per turn.
- Ladder: word 1 = level 1, word 2 = level 2, word 3 = level 3, word 4+ = level 4; passes stay at the same level; no repeats in a game.
- Clues: letters, spaces and ! ? , . ' - only; no numbers/symbols/emoji; banned letters locked as typed; max 40 chars.
- Guesses: unlimited, no cooldown, letters only, max 20; exact match ignoring case/whitespace; wrong guesses visible to all.
- Scoring: 1 point to clue-giver + 1 to the first correct guesser per cracked word.
- Profanity: whole-word matching for clues and guesses; contains-matching against a short strongest-words list for codenames.

## How to work
1. Read `SPEC.md` and look at every image in `design/` before writing code.
2. Propose the database schema, edge functions and file structure, then build.
3. Test locally (including a multi-tab playthrough with 3+ players) before pushing to GitHub.
4. Finish with a README covering local setup, Supabase setup (migrations, functions deploy) and Netlify deploy steps for a non-developer.
