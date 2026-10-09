# Letterless — Game Spec

Oct 9, 2026 · @Oliver Selby

## Overview

Letterless is an online party word game where players describe secret
words without using any of their letters, while the rest of the room
races to guess them.

- **Example:** HORSE bans H, O, R, S and E, so a clue-giver might type
  BIG QUICK ANIMAL… NAAAY! GIDDY-UP!

- **Audience:** friends and teams playing together on their phones, 3 to
  10 per room.

- **Theme:** redacted spy documents. Players are agents, rooms are case
  files, banned letters are redaction bars, and correct guesses are
  DECLASSIFIED.

- **Look:** typewriter type (Special Elite and Courier Prime) on
  off-white paper, manila folder cards, black redaction bars and a red
  stamp-ink accent.

- **Tagline:** Your mission: describe each word without any of its
  letters.

## Rooms and lobby

Rooms are private case files that friends join with a shared 5-character
case number (e.g. K7Q2M); there is no public matchmaking in version 1.

| Rule         | Decision                                                                                                                                 |
|--------------|------------------------------------------------------------------------------------------------------------------------------------------|
| Joining      | Create a new case, or enter a case number to join one                                                                                    |
| Players      | 3 to 10 agents; Begin mission needs at least 3                                                                                           |
| Codenames    | Always shown as "Agent \_\_\_". Players type only their codename: 2–10 letters, letters only, unique within the room (ignoring capitals) |
| Host         | The room's creator. Sets rounds (1, 2 or 3) and turn length (45s, 60s or 90s; default 60s)                                               |
| Late joiners | The room locks once a game starts. Newcomers wait as spectators until the next game                                                      |
| Leavers      | Their remaining turns are skipped; their score stays on the board, marked as left                                                        |
| Host leaves  | Hosting passes automatically to the next agent in turn order                                                                             |
| Emoji        | Not allowed anywhere                                                                                                                     |

## Turns and rounds

Each round, every agent gets exactly one turn as clue-giver, in a fixed
order, so everyone has an equal number of turns. A turn is rapid-fire:
the clue-giver tries to get as many words cracked as possible before the
clock runs out.

1.  **Briefing (3 seconds).** The clue-giver sees their first word.
    Everyone else sees "Agent \_\_\_ is describing" and the word's
    length as redaction bars.

2.  **Clue phase (turn length, default 60 seconds).** The clue-giver
    sends as many clues as they like; each appears instantly for
    everyone. Guessers guess at the same time.

3.  **Word cracked.** The first correct guess wins the word. A new word
    appears instantly for the clue-giver, and the clue and guess feeds
    clear for it.

4.  **Turn ends** when the clock hits zero. A word still on screen is
    simply unsolved.

5.  **Between turns (about 5 seconds).** A turn report shows how many
    words were cracked, who cracked each one, and any passed word. Then
    the next agent is announced with a GET READY stamp and a 3-second
    countdown.

6.  **End of game.** After the final round, the mission debrief shows
    the leaderboard.

## Difficulty ladder and word list

Words get harder as a turn goes on, measured by the number of different
letters banned, not word length (BANANA bans only B, A and N).

| Word in turn | Level | Banned letters | Examples                    |
|--------------|-------|----------------|-----------------------------|
| 1st          | 1     | 3–4            | KITE, PUPPY, BANANA         |
| 2nd          | 2     | 5              | HORSE, CLOUD                |
| 3rd          | 3     | 6              | GUITAR, PLANET              |
| 4th onwards  | 4     | 7+             | MONSTER, BLANKET, SUBMARINE |

- A passed word is replaced by another word at the same level.

- No word repeats within a game.

- The word list is approved: 500 family-friendly words (120 / 125 / 125
  / 130 across levels 1–4), kept in the letterless_word_list
  spreadsheet.

- Every word is spelled the same in British and American English, and
  avoids things with different UK/US names (no CHIPS, JUMPER or
  FOOTBALL).

## Clues

The clue-giver can type anything except the current word's letters, and
banned letters are locked as they type rather than rejected after
sending.

- **Allowed characters:** letters, spaces and basic punctuation (! ? , .
  ' -).

- **Not allowed:** numbers, symbols and emoji, so tricks like SH33P,
  H0RSE, @ or \$ can't stand in for letters.

- **Locked keys:** pressing a banned letter does nothing and shows a red
  note, e.g. "R is redacted. That key is locked."

- **Length:** up to 40 characters per clue, with a live counter (e.g. 2
  / 40). Clue-givers can send as many clues as they like.

- **Visibility:** every clue appears instantly for all players.

- A useful side effect: the clue-giver can never type the answer itself.

## Guessing

Guessers get unlimited guesses with no cooldown, and a guess must match
the word exactly.

- **Matching:** exact spelling, no typos and no plurals. Capitals and
  extra spaces are ignored, so "horse" and "HORSE " both count.

- **Allowed characters:** letters only, up to 20 letters.

- **Wrong guesses** are visible to everyone, which discourages spam
  because every miss gives rivals information.

- **Correct guesses** are revealed to everyone straight away: the word
  is shown with who cracked it and a DECLASSIFIED stamp, then the next
  word appears.

- **Clue-giver view:** sees every guess, right or wrong, so they can
  steer.

- **Strategy tip** (in How to play): watch which letters the clue-giver
  avoids, because they might be in the word. Also watch which letters
  they use, and try making sure your word doesn't include any of them.

## Scoring and the pass

Every cracked word is worth exactly 1 point to the clue-giver and 1
point to the agent who guessed it first, whatever its level.

- No speed bonus and no extra points for harder words; the ladder
  already rewards strong players, because faster clue-giving reaches
  more words.

- **Pass:** one per turn. The passed word is skipped with no points, and
  the next word stays at the same level.

- **Leaderboard:** each agent's total is split into Gave (words cracked
  on their turns) and Cracked (words they guessed first). The two
  columns always add up to the same total across the room.

- **Debrief highlights:** hardest crack (most banned letters) and
  fastest crack (fewest seconds).

- Ties share the same rank.

## Content filtering

Codenames, clues and guesses are all checked against the banned-words
list (banned-words-en.txt), using different matching for different
entries so innocent words aren't blocked.

| Entry             | Matching                                                         | Why                                                                                                  |
|-------------------|------------------------------------------------------------------|------------------------------------------------------------------------------------------------------|
| Guesses and clues | Whole words only                                                 | Simple contains-matching would block 10 real answers, e.g. GRAPE, CUCUMBER, PEACOCK, BUTTON, COMPASS |
| Codenames         | Contains-matching, against a shorter list of the strongest words | Stops sneaky compounds without blocking names like Agent Bass                                        |

- Because numbers and symbols are banned everywhere, look-alike tricks
  (sh1t, a\$\$) are blocked automatically.

- **British additions** to the list: wanker, bellend, knob, prick, shag,
  slag, minge, piss, nonce, retard, nazi, hitler.

- A blocked entry is simply refused with a short message; it is never
  shown to other players.

## Screens

Six phone screens are designed on the [Letterless design
canvas](https://claude.ai/artifact/HTVTRKQwpypzEY8oQJUFRh).

| \#  | Screen          | What it shows                                                                                                                                                                 |
|-----|-----------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 1   | Home            | Title and tagline, How to play stamp (top right) with a closable briefing panel, example card, codename field with fixed "Agent" prefix, Open a new case, join by case number |
| 2   | Waiting room    | Case number with copy button, agents list (host stamped), host settings for rounds and turn length, Begin mission                                                             |
| 3   | Clue-giver turn | Timer, words cracked so far, current word with its redacted letters, Pass button, clues, guesses on this word, clue box with locked keys and counter                          |
| 4   | Guesser turn    | Last-word banner with DECLASSIFIED stamp, word as redaction bars, live clues, wrong guesses, your points, guess box                                                           |
| 5   | Between turns   | Turn report with each word and who cracked it, next agent with GET READY stamp and countdown                                                                                  |
| 6   | Mission debrief | CASE CLOSED stamp, leaderboard with Gave and Cracked, hardest and fastest crack, Play again and Leave case                                                                    |

## Tech approach

The game is a web page hosted on Netlify, with Supabase acting as the
live room and the referee, all on free plans.

| Part                      | Role                                                                                               | Cost                                           |
|---------------------------|----------------------------------------------------------------------------------------------------|------------------------------------------------|
| GitHub                    | Stores the code                                                                                    | Free (account ready)                           |
| Netlify                   | Puts the game online at a public link anyone can open                                              | Free (account ready)                           |
| Supabase live rooms       | Instantly sends clues, guesses and turn changes to everyone in a case                              | Free plan, about 200 connected players at once |
| Supabase database         | Rooms, agents, scores, turn order, so late screens and refreshes can catch up                      | Free plan                                      |
| Supabase server functions | The referee: picks words, holds the secret word, checks guesses, runs the clock, passes on hosting | Free plan, no card needed                      |

- **Anti-cheating:** the secret word lives only on the server and is
  sent only to the clue-giver. Guessers' phones never receive it, so it
  can't be dug out with browser tools.

- **Free-plan quirk:** Supabase pauses free projects after about a week
  with no activity; restoring takes one click in the dashboard.

- The build is best done in Claude Code, where files can be created and
  tested directly.

## Open questions for playtesting

- [ ] Does unlimited guessing with no cooldown lead to spamming? If so,
  bring back a 3-second cooldown.

- [ ] Is 60 seconds the right default turn length?

- [ ] Are the ladder levels balanced, or does level 4 feel too hard too
  soon?

- [ ] Should ties on the final leaderboard share a rank, or be split by
  most words Cracked?

- [ ] Any words in the list that are too obscure or too easy for the
  group?
