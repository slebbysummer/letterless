import { BANNED_WORDS } from './banned-words.ts';

// Shorter list of the strongest words, contains-matched against codenames so
// sneaky compounds are caught. Deliberately excludes fragments found inside
// innocent names (ass, cock, dick, rape, cum, tit, coon, spic, ...).
export const STRONGEST_WORDS: readonly string[] = [
  'fuck', 'cunt', 'nigger', 'nigga', 'faggot', 'shit', 'wanker', 'twat',
  'bellend', 'whore', 'slut', 'nazi', 'hitler', 'paedophile', 'pedophile',
  'bitch', 'bastard', 'retard', 'spastic', 'kike', 'tranny', 'jizz', 'dildo',
  'porn', 'rapist', 'arsehole', 'asshole', 'bollock', 'minge', 'nonce',
  'blowjob', 'wetback', 'raghead', 'towelhead',
];

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[^a-z]+/).filter(Boolean);
}

const PHRASES: string[][] = BANNED_WORDS.map(tokenize).filter((p) => p.length > 0);

/** Whole-word matching (multi-word entries must appear as consecutive words). Used for clues and guesses. */
export function hasBannedWord(text: string): boolean {
  const tokens = tokenize(text);
  if (tokens.length === 0) return false;
  for (const phrase of PHRASES) {
    for (let i = 0; i + phrase.length <= tokens.length; i++) {
      let match = true;
      for (let j = 0; j < phrase.length; j++) {
        if (tokens[i + j] !== phrase[j]) { match = false; break; }
      }
      if (match) return true;
    }
  }
  return false;
}

/** Codenames: blocked if the whole name is on the full list, or it contains one of the strongest words. */
export function isBannedCodename(name: string): boolean {
  const lower = name.toLowerCase();
  if (hasBannedWord(lower)) return true;
  return STRONGEST_WORDS.some((w) => lower.includes(w));
}
