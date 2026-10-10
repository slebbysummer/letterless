import type { ReactNode } from 'react';
import type { Game, Turn } from '../lib/types.ts';
import { formatClock, secondsLeft, useNow } from '../lib/useNow.ts';

export function TurnHeader({ game, turn, who, menu }: { game: Game; turn: Turn; who: string; menu?: ReactNode }) {
  const now = useNow();
  const left = secondsLeft(turn.phase_ends_at, now);
  const briefing = turn.phase === 'briefing';
  const total = briefing ? 3 : game.turn_seconds;
  const remainingMs = Math.max(0, Date.parse(turn.phase_ends_at) - now);
  const pct = briefing ? 100 : Math.min(100, (remainingMs / (total * 1000)) * 100);
  return (
    <>
      <div className="turn-head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <span className="label">Round {turn.round} of {game.rounds} · Turn {turn.turn_no} of {game.turn_order.length}</span>
          <span className="who">{who}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span className="timer" role="timer" aria-label={briefing ? `Briefing, ${left} seconds` : `${left} seconds left`}>
            {formatClock(left)}
          </span>
          {menu}
        </div>
      </div>
      <div className="progress" aria-hidden="true"><div style={{ width: `${pct}%` }} /></div>
    </>
  );
}
