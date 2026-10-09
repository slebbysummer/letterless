import { useState } from 'react';
import { Draft, Keyboard } from '../components/Keyboard.tsx';
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
  if (!game || !turn || !me) return null;

  const spectator = me.is_spectator || !game.turn_order.includes(me.id);
  const giver = byId[turn.giver_id];
  const briefing = turn.phase === 'briefing';
  const cracked = v.turnWords.filter((w) => w.status === 'cracked').length;
  const last = [...v.turnWords].reverse().find((w) => w.status === 'cracked' || w.status === 'passed');
  const wrong = v.guesses.filter((g) => !g.correct);
  const myPoints = pointsFor(me.id, v.gameWords, turns);
  // Letters the clue-giver has used can't be in the word: dim them as a hint.
  const used = new Set(v.clues.flatMap((c) => [...c.text]).filter((ch) => /[A-Z]/.test(ch)));

  const send = async () => {
    const text = guess;
    if (!text) return;
    setGuess('');
    try {
      const res = await referee<{ correct: boolean; late?: boolean }>('guess', { room_id: room.id, text });
      setNote(res.late ? 'Too slow! That one was just cracked.' : '');
    } catch (e) {
      setNote((e as Error).message);
    }
  };

  return (
    <main className="screen fit">
      <TurnHeader game={game} turn={turn} who={`${agent(giver)} is describing`} />

      {last?.revealed_word && (
        <div className="dashed row" style={{ flexShrink: 0, padding: '6px 12px' }} data-testid="last-word">
          <span style={{ fontSize: 14 }}>
            Last word: <strong>{last.revealed_word}</strong>
            {last.status === 'cracked'
              ? <>, cracked by {last.cracked_by === me.id ? 'you' : agent(byId[last.cracked_by!])}</>
              : ', passed'}
          </span>
          {last.status === 'cracked' && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Stamp rotate={-6} size={11} pad="1px 5px">DECLASSIFIED</Stamp>
              {last.cracked_by === me.id && <strong style={{ fontSize: 16 }}>+1</strong>}
            </span>
          )}
        </div>
      )}

      <section className="card" style={{ flex: '3 1 0', minHeight: 110 }}>
        <div className="row label manila">
          <span>Word {word?.seq ?? '·'} · {word ? `${word.length} letters` : 'loading'}</span>
          <span>{cracked} cracked</span>
        </div>
        <div className="bars" aria-label={word ? `${word.length} letter word, redacted` : 'Redacted word'} data-testid="bars">
          {Array.from({ length: word?.length ?? 0 }, (_, i) => <span key={i} />)}
        </div>
        <div className="scroll" style={{ flex: 1 }}>
          {v.clues.length === 0
            ? <div className="clues empty">{briefing ? `${agent(giver)} is reading the briefing…` : 'Waiting for the first clue…'}</div>
            : <div className="clue-feed" data-testid="clues">{v.clues.map((c) => <div key={c.id}>&gt; {c.text}</div>)}</div>}
        </div>
      </section>

      <section className="grow" style={{ flex: '2 1 0' }}>
        <div className="row label"><span>Wrong guesses</span>{!spectator && <span>Your points: {myPoints}</span>}</div>
        <div className="list scroll" data-testid="guess-feed">
          {[...wrong].reverse().map((g) => (
            <div key={g.id}>
              <span>{agent(byId[g.player_id])}{g.player_id === me.id ? ' (you)' : ''}</span>
              <span className="struck">{g.text.toLowerCase()}</span>
            </div>
          ))}
        </div>
      </section>

      {spectator ? (
        <div className="dashed muted small" style={{ lineHeight: 1.4, flexShrink: 0 }}>
          This mission was already under way when you arrived. You're watching as a spectator and will join the next mission.
        </div>
      ) : (
        <div className="compose">
          <Draft text={guess.toLowerCase()} placeholder={briefing ? 'Get ready…' : 'Your guess'} testId="guess-draft" />
          <div className="note-row">
            <span className={note ? 'error' : 'muted'} role="status">
              {note || (used.size ? 'Faded keys are in the clues, so not in the word.' : 'First to crack it wins the point.')}
            </span>
          </div>
          <Keyboard
            dimmed={used}
            submitLabel="Guess"
            disabled={briefing}
            canSubmit={!briefing && !!guess}
            onKey={(ch) => { setNote(''); setGuess((g) => (g.length < GUESS_MAX ? g + ch : g)); }}
            onBackspace={() => setGuess((g) => g.slice(0, -1))}
            onInvalid={() => setNote('Guesses are letters only.')}
            onSubmit={send}
          />
        </div>
      )}
    </main>
  );
}
