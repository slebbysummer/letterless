// On-page keyboard, so the phone's own keyboard never covers the game.
// Clue-giver: banned letters are redaction bars and can't be pressed.
// Guessers: letters the clue-giver has used are dimmed (the word can't contain them).
// A laptop's physical keyboard works too.
import { useEffect, useRef } from 'react';

const ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];

export interface KeyboardProps {
  locked?: ReadonlySet<string>;     // can't be pressed (clue-giver's banned letters)
  dimmed?: ReadonlySet<string>;     // shown faded but still pressable (guesser hints)
  punctuation?: readonly string[];  // extra keys on the bottom row (clues only)
  space?: boolean;
  submitLabel: string;
  disabled?: boolean;
  canSubmit: boolean;
  onKey: (ch: string) => void;
  onLocked?: (ch: string) => void;
  onInvalid?: (ch: string) => void; // a physical key that isn't on this keyboard
  onBackspace: () => void;
  onSubmit: () => void;
}

export function Keyboard(props: KeyboardProps) {
  const { locked, dimmed, punctuation = [], space, submitLabel, disabled, canSubmit } = props;
  const latest = useRef(props);
  latest.current = props;

  // Physical keyboard support (laptops, tablets with keyboards).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const p = latest.current;
      if (p.disabled || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof HTMLElement && e.target.closest('input, textarea')) return;
      if (e.key === 'Backspace') { e.preventDefault(); p.onBackspace(); return; }
      if (e.key === 'Enter') { e.preventDefault(); if (p.canSubmit) p.onSubmit(); return; }
      if ([...e.key].length !== 1) return;
      const ch = e.key.toUpperCase();
      e.preventDefault();
      if (ch === ' ' && !p.space) return; // spaces don't matter in guesses
      if (/^[A-Z]$/.test(ch)) {
        if (p.locked?.has(ch)) p.onLocked?.(ch);
        else p.onKey(ch);
      } else if (ch === ' ' ? p.space : p.punctuation?.includes(ch)) {
        p.onKey(ch);
      } else {
        p.onInvalid?.(e.key);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const letterKey = (ch: string) => {
    const isLocked = locked?.has(ch);
    const isDim = !isLocked && dimmed?.has(ch);
    return (
      <button key={ch} type="button" className={`key${isLocked ? ' locked' : ''}${isDim ? ' dim' : ''}`} disabled={disabled}
        aria-label={isLocked ? `${ch}, redacted` : isDim ? `${ch}, used in a clue` : ch}
        onClick={() => (isLocked ? props.onLocked?.(ch) : props.onKey(ch))}>
        {ch}
      </button>
    );
  };

  return (
    // Mouse-down is cancelled so tapping a key never moves focus (no focus rings while typing).
    <div className="keyboard" role="group" aria-label="Keyboard" onMouseDown={(e) => e.preventDefault()}>
      <div className="key-row">{[...ROWS[0]].map(letterKey)}</div>
      <div className="key-row">{[...ROWS[1]].map(letterKey)}</div>
      <div className="key-row">
        {[...ROWS[2]].map(letterKey)}
        <button type="button" className="key wide" aria-label="Delete" disabled={disabled} onClick={props.onBackspace}>⌫</button>
      </div>
      <div className="key-row">
        {punctuation.map((ch) => (
          <button key={ch} type="button" className="key punct" disabled={disabled} onClick={() => props.onKey(ch)}>{ch}</button>
        ))}
        {space && <button type="button" className="key space" aria-label="Space" disabled={disabled} onClick={() => props.onKey(' ')}>space</button>}
        <button type="button" className="key submit" disabled={disabled || !canSubmit} onClick={props.onSubmit}>{submitLabel}</button>
      </div>
    </div>
  );
}

/** Looks like a text field, but never summons the phone keyboard. */
export function Draft({ text, placeholder, alert, testId }: { text: string; placeholder?: string; alert?: boolean; testId: string }) {
  return (
    <div className={`field draft${alert ? ' alert' : ''}`} role="textbox" aria-readonly="true" aria-live="polite" data-testid={testId}>
      {text ? <span>{text}</span> : <span className="placeholder">{placeholder}</span>}
      <span className="caret" aria-hidden="true" />
    </div>
  );
}
