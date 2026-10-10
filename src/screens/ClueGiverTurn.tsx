import { useEffect, useState } from 'react';
import { Draft, Keyboard, useDraft } from '../components/Keyboard.tsx';
import { GameMenu } from '../components/GameMenu.tsx';
import { TurnHeader } from '../components/TurnHeader.tsx';
import { referee } from '../lib/api.ts';
import { agent, type View } from '../lib/derive.ts';
import { bannedLetters, CLUE_MAX, CLUE_PUNCTUATION, clueCharProblem } from '../../supabase/functions/_shared/rules.ts';

export function ClueGiverTurn({ v, onLeave }: { v: View; onLeave: () => void }) {
  const { game, turn, word, secret, room, me, byId } = v;
  const draft = useDraft();
  const clue = draft.text;
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  // A half-typed clue belongs to the old word: clear it when a new word appears.
  useEffect(() => { draft.set(''); setNote(''); }, [word?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!game || !turn || !me) return null;

  const letters = secret ? bannedLetters(secret) : [];
  const banned = new Set(letters);
  const cracked = v.turnWords.filter((w) => w.status === 'cracked');
  const briefing = turn.phase === 'briefing';
  const canType = turn.phase === 'clue' && !!secret;

  const type = (ch: string) => {
    setNote(clue.length >= CLUE_MAX ? `Clues are up to ${CLUE_MAX} characters.` : '');
    draft.insert(ch, CLUE_MAX);
  };

  const send = async () => {
    const text = clue.trim();
    if (!text || busy) return;
    setBusy(true);
    draft.set('');
    try {
      await referee('send_clue', { room_id: room.id, text });
      setNote('');
    } catch (e) {
      draft.set(text);
      setNote((e as Error).message);
    }
    setBusy(false);
  };

  const pass = async () => {
    setBusy(true);
    try { await referee('pass', { room_id: room.id }); } catch (e) { setNote((e as Error).message); }
    setBusy(false);
  };

  return (
    <main className="screen fit">
      <TurnHeader game={game} turn={turn} who={`Your turn, ${agent(me)}`} menu={<GameMenu v={v} onLeave={onLeave} />} />

      <div className="row" style={{ flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span className="typed" style={{ fontSize: 26, lineHeight: 1 }} data-testid="cracked-count">{cracked.length}</span>
          <span className="label">cracked</span>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end', maxHeight: 54, overflow: 'hidden' }}>
          {[...cracked].reverse().map((w) => <span key={w.id} className="chip">{w.revealed_word}</span>)}
        </div>
      </div>

      <section className="card" style={{ flexShrink: 0 }}>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <span className="label manila" style={{ maxWidth: 190 }}>Word {word?.seq ?? ''} · only you can see this</span>
          <button type="button" className="btn ghost" style={{ height: 'auto', minHeight: 40, padding: '4px 10px', fontSize: 15, margin: '-6px -6px -6px 0', lineHeight: 1.1 }}
            disabled={turn.pass_used || busy || !word} onClick={pass}>
            Pass · {turn.pass_used ? 'used' : '1 left'}
          </button>
        </div>
        <div className="typed" style={{ fontSize: 'clamp(28px, 10vw, 40px)', lineHeight: 1, letterSpacing: '0.08em', overflowWrap: 'anywhere' }} data-testid="secret-word">
          {secret ?? '· · ·'}
        </div>
      </section>

      <section className="grow scroll" aria-label="Clues and guesses">
        <span className="label">Your clues</span>
        {v.clues.length === 0
          ? <div className="muted small">{briefing ? 'Read your word. Clues open when the briefing ends.' : 'Tap out your first clue below.'}</div>
          : <div className="clue-feed">{v.clues.map((c) => <div key={c.id}>&gt; {c.text}</div>)}</div>}
        <div className="row label" style={{ marginTop: 6 }}><span>Guesses on this word</span><span>not cracked yet</span></div>
        <div className="list" data-testid="guess-feed">
          {[...v.guesses].reverse().map((g) => (
            <div key={g.id}><span>{agent(byId[g.player_id])}</span><span className="struck">{g.text.toLowerCase()}</span></div>
          ))}
        </div>
      </section>

      <div className="compose">
        <Draft text={clue} cursor={draft.cursor} onCursor={draft.moveTo} placeholder={briefing ? 'Briefing…' : 'Type a clue'} alert={!!note} testId="clue-draft" />
        <div className="note-row">
          <span className="error" role="status" data-testid="clue-note">{note}</span>
          <span className="muted" style={{ whiteSpace: 'nowrap' }}>{clue.length} / {CLUE_MAX}</span>
        </div>
        <Keyboard
          locked={banned}
          punctuation={CLUE_PUNCTUATION}
          space
          submitLabel="Send"
          disabled={!canType}
          canSubmit={canType && !!clue.trim() && !busy}
          onKey={type}
          onLocked={(ch) => setNote(`${ch} is redacted. That key is locked.`)}
          onInvalid={(ch) => setNote(clueCharProblem(ch, banned) ?? '')}
          onBackspace={() => { setNote(''); draft.backspace(); }}
          onArrow={draft.move}
          onSubmit={send}
        />
      </div>
    </main>
  );
}
