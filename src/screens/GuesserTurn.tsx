import { useRef, useState } from 'react';
import { Stamp } from '../components/Stamp.tsx';
import { TurnHeader } from '../components/TurnHeader.tsx';
import { referee } from '../lib/api.ts';
import { agent, pointsFor, type View } from '../lib/derive.ts';
import type { Turn } from '../lib/types.ts';
import { GUESS_MAX } from '../../supabase/functions/_shared/rules.ts';

export function GuesserTurn({ v, turns }: { v: View; turns: Record<string, Turn> }) {
  const { game, turn, word, room, me, byId } = v;
  const [guess, setGuess] = useState('');
  const [note, setNote] = useState('');
  const input = useRef<HTMLInputElement>(null);
  if (!game || !turn || !me) return null;

  const spectator = me.is_spectator || !game.turn_order.includes(me.id);
  const giver = byId[turn.giver_id];
  const briefing = turn.phase === 'briefing';
  const cracked = v.turnWords.filter((w) => w.status === 'cracked').length;
  const last = [...v.turnWords].reverse().find((w) => w.status === 'cracked' || w.status === 'passed');
  const wrong = v.guesses.filter((g) => !g.correct);
  const myPoints = pointsFor(me.id, v.gameWords, turns);

  const onType = (raw: string) => {
    const letters = raw.replace(/[^A-Za-z]/g, '');
    setNote(letters !== raw.replace(/\s/g, '') ? 'Guesses are letters only.' : '');
    setGuess(letters.slice(0, GUESS_MAX));
  };

  const send = async () => {
    const text = guess.trim();
    if (!text) return;
    setGuess('');
    input.current?.focus();
    try {
      const res = await referee<{ correct: boolean; late?: boolean }>('guess', { room_id: room.id, text });
      setNote(res.late ? 'Too slow! That one was just cracked.' : '');
    } catch (e) {
      setNote((e as Error).message);
    }
  };

  return (
    <main className="screen">
      <TurnHeader game={game} turn={turn} who={`${agent(giver)} is describing`} />

      {last?.revealed_word && (
        <div className="dashed row" data-testid="last-word">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 14 }}>
              Last word: <strong>{last.revealed_word}</strong>
              {last.status === 'cracked'
                ? <>, cracked by {last.cracked_by === me.id ? 'you' : agent(byId[last.cracked_by!])}</>
                : ', passed'}
            </span>
            {last.status === 'cracked' && <span><Stamp rotate={-6} size={13} pad="1px 6px">DECLASSIFIED</Stamp></span>}
          </div>
          {last.status === 'cracked' && last.cracked_by === me.id && <strong style={{ fontSize: 18 }}>+1</strong>}
        </div>
      )}

      <section className="card">
        <div className="row label manila">
          <span>Word {word?.seq ?? '·'} · {word ? `${word.length} letters` : 'loading'}</span>
          <span>{cracked} cracked</span>
        </div>
        <div className="bars" aria-label={word ? `${word.length} letter word, redacted` : 'Redacted word'} data-testid="bars">
          {Array.from({ length: word?.length ?? 0 }, (_, i) => <span key={i} />)}
        </div>
        {v.clues.length === 0
          ? <div className="clues empty">{briefing ? `${agent(giver)} is reading the briefing…` : 'Waiting for the first clue…'}</div>
          : <div className="clues" data-testid="clues">{v.clues.map((c) => <div key={c.id}>&gt; {c.text}</div>)}</div>}
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minHeight: 0 }}>
        <div className="row label"><span>Wrong guesses</span>{!spectator && <span>Your points: {myPoints}</span>}</div>
        <div className="list">
          {wrong.map((g) => (
            <div key={g.id}>
              <span>{agent(byId[g.player_id])}{g.player_id === me.id ? ' (you)' : ''}</span>
              <span className="struck">{g.text.toLowerCase()}</span>
            </div>
          ))}
        </div>
      </section>

      {spectator ? (
        <div className="dashed muted small" style={{ lineHeight: 1.4 }}>
          This mission was already under way when you arrived. You're watching as a spectator and will join the next mission.
        </div>
      ) : (
        <form style={{ display: 'flex', flexDirection: 'column', gap: 6 }} onSubmit={(e) => { e.preventDefault(); send(); }}>
          <label htmlFor="guess" className="label">Your guess</label>
          <div className="send-row">
            <input id="guess" ref={input} className="field" type="text" value={guess} maxLength={GUESS_MAX} disabled={briefing}
              placeholder={briefing ? 'Get ready…' : ''} autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false}
              enterKeyHint="go" aria-describedby="guess-hint" onChange={(e) => onType(e.target.value)} />
            <button type="submit" className="btn" disabled={briefing || !guess}>Guess</button>
          </div>
          <div id="guess-hint" className={note ? 'error' : 'muted small'} role="status">
            {note || 'First to crack it wins the point. Guess as often as you like.'}
          </div>
        </form>
      )}
    </main>
  );
}
