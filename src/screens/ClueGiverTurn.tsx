import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { TurnHeader } from '../components/TurnHeader.tsx';
import { referee } from '../lib/api.ts';
import { agent, type View } from '../lib/derive.ts';
import { bannedLetters, CLUE_MAX, clueCharProblem, tidyClue } from '../../supabase/functions/_shared/rules.ts';

export function ClueGiverTurn({ v }: { v: View }) {
  const { game, turn, word, secret, room, me, byId } = v;
  const [clue, setClue] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  // A half-typed clue belongs to the old word: clear it when a new word appears.
  useEffect(() => { setClue(''); setNote(''); }, [word?.id]);
  if (!game || !turn || !me) return null;

  const letters = secret ? bannedLetters(secret) : [];
  const banned = new Set(letters);
  const cracked = v.turnWords.filter((w) => w.status === 'cracked');
  const briefing = turn.phase === 'briefing';
  const canType = turn.phase === 'clue'; // stays enabled between words so the phone keyboard stays open

  // Locked keys: anything banned or not allowed is dropped as it's typed, with a note saying why.
  const onType = (raw: string) => {
    let out = '';
    let problem = '';
    for (const ch of tidyClue(raw)) {
      const p = clueCharProblem(ch, banned);
      if (p) problem = p; else out += ch;
    }
    if (out.length > CLUE_MAX) { out = out.slice(0, CLUE_MAX); problem = `Clues are up to ${CLUE_MAX} characters.`; }
    setNote(problem);
    setClue(out);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
      const p = clueCharProblem(e.key, banned);
      if (p) { e.preventDefault(); setNote(p); }
    }
  };

  const send = async () => {
    const text = clue.trim();
    if (!text || busy) return;
    setBusy(true);
    setClue('');
    try {
      await referee('send_clue', { room_id: room.id, text });
      setNote('');
    } catch (e) {
      setClue(text);
      setNote((e as Error).message);
    }
    setBusy(false);
    input.current?.focus();
  };

  const pass = async () => {
    setBusy(true);
    try { await referee('pass', { room_id: room.id }); } catch (e) { setNote((e as Error).message); }
    setBusy(false);
  };

  return (
    <main className="screen">
      <TurnHeader game={game} turn={turn} who={`Your turn, ${agent(me)}`} />

      <div className="row">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span className="typed" style={{ fontSize: 28, lineHeight: 1 }} data-testid="cracked-count">{cracked.length}</span>
          <span className="label">cracked</span>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {cracked.map((w) => <span key={w.id} className="chip">{w.revealed_word}</span>)}
        </div>
      </div>

      <section className="card">
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <span className="label manila" style={{ maxWidth: 190 }}>Word {word?.seq ?? ''} · only you can see this</span>
          <button type="button" className="btn ghost" style={{ height: 'auto', minHeight: 44, padding: '4px 10px', fontSize: 15, margin: '-8px -6px -8px 0', lineHeight: 1.1 }}
            disabled={turn.pass_used || busy || !word} onClick={pass}>
            Pass · {turn.pass_used ? 'used' : '1 left'}
          </button>
        </div>
        <div className="typed" style={{ fontSize: 'clamp(30px, 11vw, 44px)', lineHeight: 1, letterSpacing: '0.08em', overflowWrap: 'anywhere' }} data-testid="secret-word">
          {secret ?? '· · ·'}
        </div>
        <div className="tiles" aria-label={`Redacted letters: ${letters.join(', ')}`}>
          <span style={{ fontSize: 13, color: 'var(--manila-text)', marginRight: 2 }}>Redacted:</span>
          {letters.map((l) => <span key={l} className="tile">{l}</span>)}
        </div>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span className="label">Your clues</span>
        {v.clues.length === 0
          ? <div className="muted small">{briefing ? 'Read your word. Clues open when the briefing ends.' : 'Send your first clue below.'}</div>
          : <div className="clues">{v.clues.map((c) => <div key={c.id}>&gt; {c.text}</div>)}</div>}
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minHeight: 0 }}>
        <div className="row label"><span>Guesses on this word</span><span>not cracked yet</span></div>
        <div className="list">
          {v.guesses.map((g) => (
            <div key={g.id}><span>{agent(byId[g.player_id])}</span><span className="struck">{g.text.toLowerCase()}</span></div>
          ))}
        </div>
      </section>

      <form style={{ display: 'flex', flexDirection: 'column', gap: 6 }} onSubmit={(e) => { e.preventDefault(); send(); }}>
        <label htmlFor="clue" className="label">Type a clue</label>
        <div className="send-row">
          <input id="clue" ref={input} className={`field${note ? ' alert' : ''}`} type="text" value={clue} disabled={!canType}
            placeholder={briefing ? 'Briefing…' : ''} autoComplete="off" autoCorrect="off" autoCapitalize="characters" spellCheck={false}
            enterKeyHint="send" aria-describedby="clue-note" onChange={(e) => onType(e.target.value)} onKeyDown={onKeyDown} />
          <button type="submit" className="btn" disabled={!canType || !clue.trim()}>Send</button>
        </div>
        <div className="row" style={{ fontSize: 13, alignItems: 'flex-start' }}>
          <span id="clue-note" className="error" role="status">{note}</span>
          <span className="muted" style={{ whiteSpace: 'nowrap' }}>{clue.length} / {CLUE_MAX}</span>
        </div>
      </form>
    </main>
  );
}
