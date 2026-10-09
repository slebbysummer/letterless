import { useState } from 'react';
import { Stamp } from '../components/Stamp.tsx';
import { referee } from '../lib/api.ts';
import { agent, highlights, scores, type View } from '../lib/derive.ts';
import type { Turn } from '../lib/types.ts';

export function Debrief({ v, turns, onLeave }: { v: View; turns: Record<string, Turn>; onLeave: () => void }) {
  const { game, room, isHost, byId, active } = v;
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (!game) return null;

  const board = scores(game, v.gameWords, turns, byId);
  const { hardest, fastest } = highlights(v.gameWords, byId);
  const host = active.find((p) => p.id === room.host_player_id);

  const again = async () => {
    setBusy(true);
    setError('');
    try { await referee('play_again', { room_id: room.id }); } catch (e) { setError((e as Error).message); setBusy(false); }
  };

  return (
    <main className="screen" style={{ gap: 18, paddingTop: 36 }}>
      <div className="row label">
        <span>Case {room.code} · {game.rounds} round{game.rounds === 1 ? '' : 's'}</span>
        <span>Final</span>
      </div>
      <div className="row" style={{ gap: 12 }}>
        <h1 className="typed" style={{ margin: 0, fontSize: 40, lineHeight: 1 }}>Mission<br />debrief</h1>
        <Stamp rotate={-8} size={20}>CASE CLOSED</Stamp>
      </div>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 6 }} data-testid="leaderboard">
        <div className="board-row head">
          <span>#</span><span>Agent</span><span className="num">Gave</span><span className="num">Cracked</span><span className="num">Pts</span>
        </div>
        {board.map((r, i) => (
          <div key={r.player.id} className={`board-row${i === 0 ? ' top' : ''}${r.player.left_at ? ' left' : ''}`}>
            <span className="typed" style={{ fontSize: 18 }}>{r.rank}</span>
            <span className="name">{agent(r.player)}{r.player.left_at ? ' (left)' : ''}</span>
            <span className="num">{r.gave}</span>
            <span className="num">{r.cracked}</span>
            <span className="pts">{r.total}</span>
          </div>
        ))}
        <div className="muted" style={{ fontSize: 12, padding: '2px 10px 0' }}>
          Gave = words cracked on your turns.<br />Cracked = words you guessed first.
        </div>
      </section>

      {(hardest || fastest) && (
        <section className="highlights">
          {[{ title: 'Hardest crack', h: hardest }, { title: 'Fastest crack', h: fastest }].map(({ title, h }) => h && (
            <div key={title}>
              <span className="label">{title}</span>
              <span className="typed" style={{ fontSize: 19, overflowWrap: 'anywhere' }}>{h.word}</span>
              <span className="small">{h.detail} · {agent(h.by)}</span>
            </div>
          ))}
        </section>
      )}

      <div className="bottom" style={{ gap: 10 }}>
        <div className="error" role="alert">{error}</div>
        {isHost
          ? <button type="button" className="btn big" disabled={busy} onClick={again}>Play again, same agents</button>
          : <button type="button" className="btn big" disabled>Waiting for {agent(host)} to play again</button>}
        <button type="button" className="btn ghost" onClick={onLeave}>Leave case</button>
      </div>
    </main>
  );
}
