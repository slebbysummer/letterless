import { useState } from 'react';
import { Draft, Keyboard, useDraft } from '../components/Keyboard.tsx';
import { Stamp } from '../components/Stamp.tsx';
import { GameMenu } from '../components/GameMenu.tsx';
import { TurnHeader } from '../components/TurnHeader.tsx';
import { referee } from '../lib/api.ts';
import { agent, isCoop, pointsFor, teamScore, type View } from '../lib/derive.ts';
import type { Turn } from '../lib/types.ts';
import { GUESS_MAX } from '../../supabase/functions/_shared/rules.ts';

export function GuesserTurn({ v, turns, onLeave }: { v: View; turns: Record<string, Turn>; onLeave: () => void }) {
  const { game, turn, word, room, me, byId } = v;
  const draft = useDraft();
  const [note, setNote] = useState('');
  if (!game || !turn || !me) return null;

  const spectator = me.is_spectator || !game.turn_order.includes(me.id);
  const giver = byId[turn.giver_id];
  const briefing = turn.phase === 'briefing';
  const cracked = v.turnWords.filter((w) => w.status === 'cracked').length;
  const last = [...v.turnWords].reverse().find((w) => w.status === 'cracked' || w.status === 'passed');
  const wrong = v.guesses.filter((g) => !g.correct);
  const coop = isCoop(game);
  const points = coop ? teamScore(v.gameWords) : pointsFor(me.id, v.gameWords, turns);
  // Letters the clue-giver has used can't be in the word: dim them as a hint.
  const used = new Set(v.clues.flatMap((c) => [...c.text]).filter((ch) => /[A-Z]/.test(ch)));
  // Newest clue first: it's what guessers need most, and it never scrolls out of view.
  const clues = [...v.clues].reverse();

  const send = async () => {
    const text = draft.text;
    if (!text) return;
    draft.set('');
    try {
      const res = await referee<{ correct: boolean; late?: boolean }>('guess', { room_id: room.id, text });
      setNote(res.late ? 'Too slow! That one was just cracked.' : '');
    } catch (e) {
      setNote((e as Error).message);
    }
  };

  return (
    <main className="screen fit">
      <TurnHeader game={game} turn={turn} who={`${agent(giver)} is describing`} menu={<GameMenu v={v} onLeave={onLeave} />} />

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
              {coop ? <strong style={{ fontSize: 16 }}>+1 team</strong> : last.cracked_by === me.id && <strong style={{ fontSize: 16 }}>+1</strong>}
            </span>
          )}
        </div>
      )}

      <section className="card" style={{ flex: '1 1 0', minHeight: 100 }}>
        <div className="row label manila">
          <span>Word {word?.seq ?? '·'} · {word ? `${word.length} letters` : 'loading'}</span>
          <span>{cracked} cracked</span>
        </div>
        <div className="bars" aria-label={word ? `${word.length} letter word, redacted` : 'Redacted word'} data-testid="bars">
          {Array.from({ length: word?.length ?? 0 }, (_, i) => <span key={i} />)}
        </div>
        <div className="scroll" style={{ flex: 1 }}>
          {clues.length === 0
            ? <div className="clues empty">{briefing ? `${agent(giver)} is reading the briefing…` : 'Waiting for the first clue…'}</div>
            : (
              <div className="clue-feed latest-first" data-testid="clues" aria-live="polite">
                {clues.map((c, i) => <div key={c.id} className={i === 0 ? 'latest' : undefined}>&gt; {c.text}</div>)}
              </div>
            )}
        </div>
      </section>

      <section style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div className="row label"><span>Wrong guesses</span>{!spectator && <span>{coop ? 'Team score' : 'Your points'}: {points}</span>}</div>
        <div className="guess-strip" data-testid="guess-feed">
          {wrong.length === 0 && <span className="muted" style={{ border: 'none', padding: 0 }}>None yet</span>}
          {[...wrong].reverse().map((g) => (
            <span key={g.id}>
              <s>{g.text.toLowerCase()}</s> <small>{g.player_id === me.id ? 'you' : byId[g.player_id]?.codename}</small>
            </span>
          ))}
        </div>
      </section>

      {spectator ? (
        <div className="dashed muted small" style={{ lineHeight: 1.4, flexShrink: 0 }}>
          This mission was already under way when you arrived. You're watching as a spectator and will join the next mission.
        </div>
      ) : (
        <div className="compose">
          <Draft text={draft.text.toLowerCase()} cursor={draft.cursor} onCursor={draft.moveTo}
            placeholder={briefing ? 'Get ready…' : 'Your guess'} testId="guess-draft" />
          <div className="note-row">
            <span className={note ? 'error' : 'muted'} role="status">
              {note || (used.size ? 'Faded keys are in the clues, so not in the word.' : coop ? 'Every word you crack adds to your team score.' : 'First to crack it wins the point.')}
            </span>
          </div>
          <Keyboard
            dimmed={used}
            submitLabel="Guess"
            disabled={briefing}
            canSubmit={!briefing && !!draft.text}
            onKey={(ch) => { setNote(''); draft.insert(ch, GUESS_MAX); }}
            onBackspace={draft.backspace}
            onArrow={draft.move}
            onInvalid={() => setNote('Guesses are letters only.')}
            onSubmit={send}
          />
        </div>
      )}
    </main>
  );
}
