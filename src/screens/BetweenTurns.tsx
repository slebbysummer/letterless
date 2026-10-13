import { GameMenu } from '../components/GameMenu.tsx';
import { Stamp } from '../components/Stamp.tsx';
import { agent, isCoop, type View } from '../lib/derive.ts';
import { secondsLeft, useNow } from '../lib/useNow.ts';

export function BetweenTurns({ v, onLeave }: { v: View; onLeave: () => void }) {
  const { game, turn, room, me, byId } = v;
  const now = useNow();
  if (!game || !turn) return null;

  const giver = byId[turn.giver_id];
  const cracked = v.turnWords.filter((w) => w.status === 'cracked');
  const next = turn.next_giver_id ? byId[turn.next_giver_id] : null;
  const left = secondsLeft(turn.phase_ends_at, now);

  return (
    <main className="screen roomy" style={{ paddingTop: 36 }}>
      <div className="row label">
        <span>Round {turn.round} of {game.rounds} · Turn {turn.turn_no} of {game.turn_order.length}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>Case {room.code}<GameMenu v={v} onLeave={onLeave} /></span>
      </div>

      <section className="card" style={{ padding: 18, gap: 12 }} data-testid="turn-report">
        <div className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span className="label manila">Turn report</span>
            <span className="typed" style={{ fontSize: 26, lineHeight: 1.1 }}>{agent(giver)} cracked {cracked.length}</span>
          </div>
          <span className="typed" style={{ fontSize: 22, whiteSpace: 'nowrap' }}>+{cracked.length} {isCoop(game) ? 'team' : 'pts'}</span>
        </div>
        <div className="list">
          {v.turnWords.map((w) => (
            w.status === 'cracked' ? (
              <div key={w.id}>
                <span style={{ fontWeight: 700, letterSpacing: '0.04em' }}>{w.revealed_word}</span>
                <span>{w.cracked_by === me?.id ? 'You' : agent(byId[w.cracked_by!])}</span>
              </div>
            ) : (
              <div key={w.id} className="muted" style={{ borderBottomStyle: w.status === 'passed' ? 'dashed' : 'solid' }}>
                <span style={{ textDecoration: w.status === 'passed' ? 'line-through' : undefined, letterSpacing: '0.04em' }}>{w.revealed_word ?? '·····'}</span>
                <span style={{ fontStyle: 'italic' }}>{w.status === 'passed' ? 'passed' : 'unsolved'}</span>
              </div>
            )
          ))}
        </div>
        {giver?.left_at && <div className="small" style={{ color: 'var(--manila-text)' }}>{agent(giver)} left the case.</div>}
      </section>

      <section style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, textAlign: 'center' }}>
        {next ? (
          <>
            <span className="label">Next agent up</span>
            <div className="big-name" data-testid="next-agent">{next.id === me?.id ? 'You' : agent(next)}</div>
            <Stamp rotate={-5} size={18} pad="4px 12px">GET READY</Stamp>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 6 }}>
              <span style={{ fontSize: 15 }}>Briefing in</span>
              <span className="typed" style={{ fontSize: 56, lineHeight: 1, color: 'var(--red)' }}>{left}</span>
            </div>
            <div className="muted" style={{ fontSize: 14, maxWidth: 280, lineHeight: 1.4 }}>
              {next.id === me?.id ? 'Your first word appears next. Only you will see it.' : 'Everyone else: thumbs on keyboards.'}
            </div>
          </>
        ) : (
          <>
            <span className="label">That was the final turn</span>
            <Stamp rotate={-5} size={18} pad="4px 12px">CASE CLOSING</Stamp>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 6 }}>
              <span style={{ fontSize: 15 }}>Debrief in</span>
              <span className="typed" style={{ fontSize: 56, lineHeight: 1, color: 'var(--red)' }}>{left}</span>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
