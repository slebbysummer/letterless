// On-page keyboard, so the phone's own keyboard never covers the game.
// Clue-giver: banned letters are redaction bars and can't be pressed.
// Guessers: letters the clue-giver has used are dimmed (the word can't contain them).
// Keys fire on touch-down (like a phone keyboard), show a pop-up of the letter,
// and Delete repeats when held. A laptop's physical keyboard works too.
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

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
  onArrow?: (delta: -1 | 1) => void;
  onSubmit: () => void;
}

const buzz = () => { try { navigator.vibrate?.(6); } catch { /* not supported */ } };

export function Keyboard(props: KeyboardProps) {
  const { locked, dimmed, punctuation = [], space, submitLabel, disabled, canSubmit } = props;
  const latest = useRef(props);
  latest.current = props;
  const [pressed, setPressed] = useState<string | null>(null);
  const lastPointer = useRef(0);
  const repeat = useRef<{ t?: ReturnType<typeof setTimeout>; i?: ReturnType<typeof setInterval> }>({});

  const stopRepeat = () => {
    clearTimeout(repeat.current.t);
    clearInterval(repeat.current.i);
    repeat.current = {};
  };
  useEffect(() => stopRepeat, []);

  // Physical keyboard support (laptops, tablets with keyboards).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const p = latest.current;
      if (p.disabled || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof HTMLElement && e.target.closest('input, textarea')) return;
      if (e.key === 'Backspace') { e.preventDefault(); p.onBackspace(); return; }
      if (e.key === 'Enter') { e.preventDefault(); if (p.canSubmit) p.onSubmit(); return; }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); p.onArrow?.(e.key === 'ArrowLeft' ? -1 : 1); return; }
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

  // Keys act on touch-down for speed. Clicks that don't come from a touch or
  // mouse (e.g. screen readers) still work through onClick.
  const handlers = (id: string, act: () => void, opts: { popup?: boolean; repeat?: boolean } = {}) => ({
    onPointerDown: (e: ReactPointerEvent) => {
      if (e.button !== 0 || disabled) return;
      lastPointer.current = Date.now();
      buzz();
      if (opts.popup) setPressed(id);
      act();
      if (opts.repeat) {
        repeat.current.t = setTimeout(() => { repeat.current.i = setInterval(act, 70); }, 400);
      }
    },
    onPointerUp: () => { setPressed(null); stopRepeat(); },
    onPointerLeave: () => { setPressed(null); stopRepeat(); },
    onPointerCancel: () => { setPressed(null); stopRepeat(); },
    onClick: () => { if (Date.now() - lastPointer.current > 600) act(); },
  });

  const letterKey = (ch: string) => {
    const isLocked = locked?.has(ch);
    const isDim = !isLocked && dimmed?.has(ch);
    return (
      <button key={ch} type="button" className={`key letter${isLocked ? ' locked' : ''}${isDim ? ' dim' : ''}`} disabled={disabled}
        aria-label={isLocked ? `${ch}, redacted` : isDim ? `${ch}, used in a clue` : ch}
        {...handlers(ch, () => (isLocked ? latest.current.onLocked?.(ch) : latest.current.onKey(ch)), { popup: !isLocked })}>
        {ch}
        {pressed === ch && <span className="key-pop" aria-hidden="true">{ch}</span>}
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
        <button type="button" className="key wide" aria-label="Delete" disabled={disabled}
          {...handlers('del', () => latest.current.onBackspace(), { repeat: true })}>⌫</button>
      </div>
      <div className="key-row bottom-row">
        {punctuation.map((ch) => (
          <button key={ch} type="button" className="key punct" disabled={disabled}
            {...handlers(ch, () => latest.current.onKey(ch), { popup: true })}>
            {ch}
            {pressed === ch && <span className="key-pop" aria-hidden="true">{ch}</span>}
          </button>
        ))}
        {space && <button type="button" className="key space" aria-label="Space" disabled={disabled}
          {...handlers('space', () => latest.current.onKey(' '))}>space</button>}
        <button type="button" className="key submit" disabled={disabled || !canSubmit}
          {...handlers('submit', () => { if (latest.current.canSubmit) latest.current.onSubmit(); })}>{submitLabel}</button>
      </div>
    </div>
  );
}

/** Text being typed plus a cursor position, so letters can be fixed mid-word. */
export interface DraftState { text: string; cursor: number }

export function useDraft() {
  const [draft, setDraft] = useState<DraftState>({ text: '', cursor: 0 });
  return {
    ...draft,
    set: (text: string) => setDraft({ text, cursor: text.length }),
    insert: (ch: string, max: number) => setDraft(({ text, cursor }) => (
      text.length >= max ? { text, cursor } : { text: text.slice(0, cursor) + ch + text.slice(cursor), cursor: cursor + 1 }
    )),
    backspace: () => setDraft(({ text, cursor }) => (
      cursor === 0 ? { text, cursor } : { text: text.slice(0, cursor - 1) + text.slice(cursor), cursor: cursor - 1 }
    )),
    moveTo: (i: number) => setDraft(({ text }) => ({ text, cursor: Math.max(0, Math.min(text.length, i)) })),
    move: (delta: number) => setDraft(({ text, cursor }) => ({ text, cursor: Math.max(0, Math.min(text.length, cursor + delta)) })),
  };
}

/**
 * Looks like a text field, but never summons the phone keyboard.
 * Tap a letter to put the cursor next to it; tap the empty end to go back to the end.
 */
export function Draft({ text, cursor, onCursor, placeholder, alert, testId }: {
  text: string; cursor: number; onCursor: (i: number) => void; placeholder?: string; alert?: boolean; testId: string;
}) {
  const caret = <span key="caret" className="caret" aria-hidden="true" />;
  const chars = [...text].map((ch, i) => (
    <span key={i} className="ch" onPointerDown={(e) => {
      e.stopPropagation();
      const r = e.currentTarget.getBoundingClientRect();
      onCursor(e.clientX < r.left + r.width / 2 ? i : i + 1);
    }}>{ch}</span>
  ));
  if (text) chars.splice(cursor, 0, caret);
  return (
    <div className={`field draft${alert ? ' alert' : ''}`} role="textbox" aria-readonly="true" aria-live="polite" data-testid={testId}
      onPointerDown={() => onCursor(text.length)}>
      {text ? chars : <>{caret}<span className="placeholder">{placeholder}</span></>}
    </div>
  );
}
