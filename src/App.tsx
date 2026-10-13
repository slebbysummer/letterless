import { useEffect, useRef, useState } from 'react';
import { referee } from './lib/api.ts';
import { serverNow } from './lib/clock.ts';
import { derive } from './lib/derive.ts';
import { ensureSession } from './lib/supabase.ts';
import { fetchSecret, useRoom } from './lib/useRoom.ts';
import { BetweenTurns } from './screens/BetweenTurns.tsx';
import { ClueGiverTurn } from './screens/ClueGiverTurn.tsx';
import { Debrief } from './screens/Debrief.tsx';
import { GuesserTurn } from './screens/GuesserTurn.tsx';
import { Home, type Entered } from './screens/Home.tsx';
import { WaitingRoom } from './screens/WaitingRoom.tsx';

const SAVED_ROOM = 'letterless-room';

function saved(): Entered | null {
  try { return JSON.parse(sessionStorage.getItem(SAVED_ROOM) ?? 'null'); } catch { return null; }
}

function Message({ text, action }: { text: string; action?: { label: string; onClick: () => void } }) {
  return (
    <main className="screen" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center', gap: 20 }}>
      <h1 className="title" style={{ fontSize: 40 }}>Letterless</h1>
      <p className="muted" role="status">{text}</p>
      {action && <button type="button" className="btn ghost" onClick={action.onClick}>{action.label}</button>}
    </main>
  );
}

export function App() {
  const [userId, setUserId] = useState<string | null>(null);
  const [bootError, setBootError] = useState('');
  const [entry, setEntry] = useState<Entered | null>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const uid = await ensureSession();
        const room = saved();
        if (room) {
          // Coming back after a refresh: rejoin the same seat.
          try { setEntry(await referee<Entered>('join_room', { code: room.code })); } catch (e) {
            sessionStorage.removeItem(SAVED_ROOM);
            setNotice((e as Error).message);
          }
        }
        setUserId(uid);
      } catch (e) {
        setBootError((e as Error).message);
      }
    })();
  }, []);

  const enter = (e: Entered) => {
    sessionStorage.setItem(SAVED_ROOM, JSON.stringify(e));
    setNotice('');
    setEntry(e);
  };

  const exit = (message = '') => {
    sessionStorage.removeItem(SAVED_ROOM);
    setNotice(message);
    setEntry(null);
  };

  const leave = () => {
    // Unmount the room first so the "dropped, rejoin" logic can't fire on our own exit.
    if (entry) referee('leave', { room_id: entry.room_id }).catch(() => {});
    exit();
  };

  if (bootError) return <Message text={bootError} action={{ label: 'Reload', onClick: () => location.reload() }} />;
  if (!userId) return <Message text="Opening case file…" />;
  if (!entry) return <Home onEnter={enter} notice={notice} />;
  return <RoomScreen key={entry.room_id} entry={entry} userId={userId} onLeave={leave} onGone={exit} />;
}

function RoomScreen({ entry, userId, onLeave, onGone }: {
  entry: Entered; userId: string; onLeave: () => void; onGone: (message: string) => void;
}) {
  const { state, connected, reload, setSecret } = useRoom(entry.room_id);
  const v = derive(state, userId);
  const roomId = entry.room_id;
  const status = v?.room.status;
  const endsAt = v?.turn?.phase_ends_at;
  const giverWordId = v?.isGiver ? v.word?.id : undefined;
  const rejoining = useRef(false);

  // Heartbeat (also syncs the clock) every 15 seconds.
  useEffect(() => {
    const beat = () => referee('advance', { room_id: roomId }).catch(() => {});
    beat();
    const id = setInterval(beat, 15000);
    return () => clearInterval(id);
  }, [roomId]);

  // When the current phase runs out, nudge the referee to move on (it ignores early or duplicate nudges).
  useEffect(() => {
    if (status !== 'playing' || !endsAt) return;
    let timer: ReturnType<typeof setTimeout>;
    const fire = () => {
      referee('advance', { room_id: roomId }).catch(() => {});
      timer = setTimeout(fire, 2000);
    };
    timer = setTimeout(fire, Math.max(0, Date.parse(endsAt) - serverNow() + 150 + Math.random() * 300));
    return () => clearTimeout(timer);
  }, [status, endsAt, roomId]);

  // The clue-giver fetches their secret word whenever a new one appears.
  const secretKnown = giverWordId ? !!state.secrets[giverWordId] : true;
  useEffect(() => {
    if (!giverWordId || secretKnown) return;
    let stop = false;
    let tries = 0;
    const get = async () => {
      const word = await fetchSecret(giverWordId);
      if (stop) return;
      if (word) setSecret(giverWordId, word);
      else if (++tries < 15) setTimeout(get, 300);
    };
    get();
    return () => { stop = true; };
  }, [giverWordId, secretKnown]); // eslint-disable-line react-hooks/exhaustive-deps

  // If we were dropped from the room (e.g. the phone slept for a long time), try to rejoin once.
  const missing = state.loaded && (!state.room || !v?.me);
  useEffect(() => {
    if (!missing || rejoining.current) return;
    rejoining.current = true;
    referee('join_room', { code: entry.code })
      .then(() => { rejoining.current = false; reload(); })
      .catch((e) => onGone((e as Error).message));
  }, [missing]); // eslint-disable-line react-hooks/exhaustive-deps

  // Safety net: mid-game but missing the current turn (e.g. an update went
  // astray)? Reload the room's state after a moment.
  const incomplete = state.loaded && status === 'playing' && !(v?.game && v.turn);
  useEffect(() => {
    if (!incomplete) return;
    const t = setTimeout(reload, 1500);
    return () => clearTimeout(t);
  }, [incomplete]); // eslint-disable-line react-hooks/exhaustive-deps

  const banner = !connected && <div className="banner" role="status">Reconnecting…</div>;
  if (!v || !v.me) return <Message text="Opening case file…" />;

  let screen;
  if (v.room.status === 'lobby') {
    screen = <WaitingRoom v={v} onLeave={onLeave} />;
  } else if (v.room.status === 'finished' && v.game) {
    screen = <Debrief v={v} turns={state.turns} onLeave={onLeave} />;
  } else if (v.room.status === 'playing' && v.game && v.turn) {
    if (v.turn.phase === 'report' || v.turn.phase === 'done') screen = <BetweenTurns v={v} onLeave={onLeave} />;
    else if (v.isGiver) screen = <ClueGiverTurn v={v} onLeave={onLeave} />;
    else screen = <GuesserTurn v={v} turns={state.turns} onLeave={onLeave} />;
  } else {
    screen = <Message text="Opening case file…" />;
  }
  return <>{screen}{banner}</>;
}
