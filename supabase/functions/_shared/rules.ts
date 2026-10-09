// Game rules shared by the browser (for instant feedback) and the referee
// function (the real check). Keep this file free of browser/Deno-only APIs.
import { hasBannedWord, isBannedCodename } from './profanity.ts';

export const MIN_AGENTS = 2;
export const MAX_AGENTS = 8;
export const CLUE_MAX = 40;
export const GUESS_MAX = 20;
export const ROUND_OPTIONS = [1, 2, 3] as const;
export const TURN_OPTIONS = [60, 90, 120] as const;
export const DEFAULT_TURN_SECONDS = 90;
export const BRIEFING_SECONDS = 3;
export const REPORT_SECONDS = 5;
export const CODE_LENGTH = 5;

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const CLUE_CHAR = /^[A-Z !?,.'-]$/;

/** Punctuation keys on the clue keyboard. */
export const CLUE_PUNCTUATION = ['!', '?', ',', '.', "'", '-'] as const;

/** Distinct letters of a word, in the order they first appear (MONSTER -> M,O,N,S,T,E,R). */
export function bannedLetters(word: string): string[] {
  return [...new Set(word.toUpperCase())];
}

/**
 * The word pool (mirrors words.in_pool in the database): at most one vowel banned
 * with 3-5 banned letters, or two vowels banned with only 3-4 banned letters.
 */
export function inWordPool(word: string): boolean {
  const letters = bannedLetters(word);
  const vowels = letters.filter((l) => 'AEIOU'.includes(l)).length;
  const n = letters.length;
  return (vowels <= 1 && n >= 3 && n <= 5) || (vowels === 2 && n >= 3 && n <= 4);
}

export function validateCodename(raw: string): Result<string> {
  const name = raw.trim();
  if (name.length === 0) return { ok: false, error: 'Enter a codename first.' };
  if (!/^[A-Za-z]+$/.test(name)) return { ok: false, error: 'Codenames are letters only. No spaces, numbers or emoji.' };
  if (name.length < 2 || name.length > 10) return { ok: false, error: 'Codenames are 2 to 10 letters.' };
  if (isBannedCodename(name)) return { ok: false, error: 'That codename is redacted. Pick another.' };
  return { ok: true, value: name[0].toUpperCase() + name.slice(1) };
}

export function normalizeCaseCode(raw: string): Result<string> {
  const code = raw.replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z0-9]{5}$/.test(code)) return { ok: false, error: 'Case numbers are 5 letters and numbers, like K7Q2M.' };
  return { ok: true, value: code };
}

/** Why a character can't go in a clue, or null if it can. */
export function clueCharProblem(ch: string, banned: ReadonlySet<string>): string | null {
  const up = ch.toUpperCase();
  if (banned.has(up)) return `${up} is redacted. That key is locked.`;
  if (CLUE_CHAR.test(up)) return null;
  if (/\p{N}/u.test(ch)) return 'Numbers are redacted.';
  if (/\p{L}/u.test(ch)) return 'Only plain A to Z letters are allowed.';
  return 'Symbols and emoji are redacted.';
}

/** Tidy typed text: curly quotes to straight, uppercase, single spaces. */
export function tidyClue(raw: string): string {
  return raw.replace(/[‘’ʼ]/g, "'").replace(/[‐-—]/g, '-').toUpperCase();
}

/** Full check of a clue (server-side source of truth; banned letters are checked against the word too). */
export function validateClue(raw: string, word?: string): Result<string> {
  const clue = tidyClue(raw).replace(/\s+/g, ' ').trim();
  if (clue.length === 0) return { ok: false, error: 'Type a clue first.' };
  if (clue.length > CLUE_MAX) return { ok: false, error: `Clues are up to ${CLUE_MAX} characters.` };
  const banned = new Set(word ? bannedLetters(word) : []);
  for (const ch of clue) {
    const problem = clueCharProblem(ch, banned);
    if (problem) return { ok: false, error: problem };
  }
  if (hasBannedWord(clue)) return { ok: false, error: 'That clue is redacted. Keep it clean.' };
  return { ok: true, value: clue };
}

/** Guesses: letters only, capitals and spaces ignored. */
export function validateGuess(raw: string): Result<string> {
  const guess = raw.replace(/\s+/g, '').toUpperCase();
  if (guess.length === 0) return { ok: false, error: 'Type a guess first.' };
  if (!/^[A-Z]+$/.test(guess)) return { ok: false, error: 'Guesses are letters only.' };
  if (guess.length > GUESS_MAX) return { ok: false, error: `Guesses are up to ${GUESS_MAX} letters.` };
  if (hasBannedWord(guess)) return { ok: false, error: 'That guess is redacted. Keep it clean.' };
  return { ok: true, value: guess };
}
