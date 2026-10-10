import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { hasBannedWord, isBannedCodename } from '../../supabase/functions/_shared/profanity.ts';
import {
  bannedLetters, clueCharProblem, inWordPool, normalizeCaseCode, validateClue, validateCodename, validateGuess,
} from '../../supabase/functions/_shared/rules.ts';

const words = readFileSync(new URL('../../data/words.csv', import.meta.url), 'utf8')
  .trim().split('\n').slice(1).map((l) => l.split(','));

describe('word list', () => {
  it('has the original 500 words plus 217 easy additions, no duplicates', () => {
    expect(words).toHaveLength(717);
    expect(new Set(words.map((w) => w[0])).size).toBe(717);
  });
  it('records the right banned-letter count for every word', () => {
    for (const [w, banned] of words) expect(bannedLetters(w).length, w).toBe(Number(banned));
  });
  it('never blocks a real answer', () => {
    for (const [w] of words) expect(validateGuess(w).ok, w).toBe(true);
  });
});

describe('banned letters', () => {
  it('lists distinct letters in order', () => {
    expect(bannedLetters('MONSTER')).toEqual(['M', 'O', 'N', 'S', 'T', 'E', 'R']);
    expect(bannedLetters('banana')).toEqual(['B', 'A', 'N']);
  });
  it('has a 361-word easy pool that never bans more than two vowels', () => {
    expect(words.filter((w) => inWordPool(w[0])).length).toBe(361);
    expect(inWordPool('SHARK')).toBe(true);   // 1 vowel, 5 banned
    expect(inWordPool('CAKE')).toBe(true);    // 2 vowels, 4 banned
    expect(inWordPool('HORSE')).toBe(false);  // 2 vowels, 5 banned
    expect(inWordPool('PIANO')).toBe(false);  // 3 vowels
  });
});

describe('codenames', () => {
  it('accepts 2-10 letters and capitalises', () => {
    expect(validateCodename(' fox ')).toEqual({ ok: true, value: 'Fox' });
    expect(validateCodename('Bass').ok).toBe(true);
    expect(validateCodename('Peacock').ok).toBe(true);
  });
  it('rejects bad shapes', () => {
    for (const bad of ['', 'X', 'Elevenchars', 'Fox1', 'Mr Fox', 'Fox🦊']) expect(validateCodename(bad).ok, bad).toBe(false);
  });
  it('blocks strongest words even inside compounds, and whole banned words', () => {
    expect(isBannedCodename('Fuckface')).toBe(true);
    expect(isBannedCodename('Hitlerfan')).toBe(true);
    expect(isBannedCodename('Slut')).toBe(true);
    expect(isBannedCodename('Scunthorp')).toBe(true);
    expect(isBannedCodename('Hancock')).toBe(false);
  });
});

describe('clues', () => {
  it('allows letters, spaces and basic punctuation', () => {
    expect(validateClue("big  animal... naaay! giddy-up? it's")).toEqual({ ok: true, value: "BIG ANIMAL... NAAAY! GIDDY-UP? IT'S" });
  });
  it('blocks numbers, symbols and emoji', () => {
    for (const bad of ['SH33P', 'H0RSE', 'A @ B', 'COST $', 'HI 👋']) expect(validateClue(bad).ok, bad).toBe(false);
  });
  it('locks banned letters of the word', () => {
    const r = validateClue('GR', 'MONSTER');
    expect(r).toEqual({ ok: false, error: 'R is redacted. That key is locked.' });
    expect(clueCharProblem('r', new Set(['R']))).toBe('R is redacted. That key is locked.');
  });
  it('caps length at 40', () => {
    expect(validateClue('A'.repeat(40)).ok).toBe(true);
    expect(validateClue('A'.repeat(41)).ok).toBe(false);
  });
  it('blocks accented letters that could dodge a ban', () => {
    expect(validateClue('HÉLLO').ok).toBe(false);
  });
});

describe('profanity: whole words only for clues and guesses', () => {
  it('lets innocent words through', () => {
    for (const ok of ['GRAPE', 'CUCUMBER', 'PEACOCK', 'BUTTON', 'COMPASS', 'SCUNTHORPE', 'CLASSIC', 'ASSIST']) {
      expect(hasBannedWord(ok), ok).toBe(false);
    }
  });
  it('blocks whole banned words and phrases, including British additions', () => {
    for (const bad of ['BIG ASS', 'WANKER', 'YOU BELLEND', 'TIED UP TIGHT', 'G SPOT']) expect(hasBannedWord(bad), bad).toBe(true);
    expect(validateClue('ugly bellend').ok).toBe(false);
  });
});

describe('guesses', () => {
  it('ignores capitals and spaces', () => {
    expect(validateGuess('horse ')).toEqual({ ok: true, value: 'HORSE' });
    expect(validateGuess(' Ho rse')).toEqual({ ok: true, value: 'HORSE' });
  });
  it('is letters only, max 20', () => {
    expect(validateGuess('h0rse').ok).toBe(false);
    expect(validateGuess('a'.repeat(21)).ok).toBe(false);
    expect(validateGuess('prick').ok).toBe(false);
  });
});

describe('case numbers', () => {
  it('normalises', () => {
    expect(normalizeCaseCode(' k7q2m')).toEqual({ ok: true, value: 'K7Q2M' });
    expect(normalizeCaseCode('K7Q2').ok).toBe(false);
  });
});
