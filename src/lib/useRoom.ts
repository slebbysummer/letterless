// Live copy of everything a phone may see about its room. Loads a snapshot from
// the database (so refreshes and late joiners catch up), then applies Realtime
// changes as they arrive. Reloads the snapshot whenever the channel reconnects.
import { useEffect, useReducer, useRef, useState } from 'react';
import { supabase } from './supabase.ts';
import type { Clue, Game, Guess, Player, Room, Turn, TurnWord } from './types.ts';

type ById<T> = Record<string, T>;

export interface RoomState {
  loaded: boolean;
  room: Room | null;
  players: ById<Player>;
  games: ById<Game>;
  turns: ById<Turn>;
  words: ById<TurnWord>;
  clues: ById<Clue>;
  guesses: ById<Guess>;
  secrets: ById<string>; // turn_word_id -> word (only ever filled for the clue-giver)
}

const TABLE_KEYS = {
  players: 'players', games: 'games', turns: 'turns', turn_words: 'words', clues: 'clues', guesses: 'guesses',
} as const;
type Table = keyof typeof TABLE_KEYS | 'rooms';

type Upsert = { type: 'upsert'; table: Table; row: { id: string } };
type Action =
  | { type: 'load'; snapshot: Omit<RoomState, 'loaded' | 'secrets'>; replay: Upsert[] }
  | Upsert
  | { type: 'secret'; id: string; word: string };

const empty: RoomState = {
  loaded: false, room: null, players: {}, games: {}, turns: {}, words: {}, clues: {}, guesses: {}, secrets: {},
};

function byId<T extends { id: string }>(rows: T[] | null): ById<T> {
  return Object.fromEntries((rows ?? []).map((r) => [r.id, r]));
}

function reducer(state: RoomState, action: Action): RoomState {
  switch (action.type) {
    case 'load':
      // Events that arrived while the snapshot was loading are replayed on top.
      return action.replay.reduce(reducer, { ...action.snapshot, loaded: true, secrets: state.secrets });
    case 'upsert': {
      if (action.table === 'rooms') return { ...state, room: action.row as Room };
      const key = TABLE_KEYS[action.table];
      return { ...state, [key]: { ...state[key], [action.row.id]: action.row } };
    }
    case 'secret':
      return { ...state, secrets: { ...state.secrets, [action.id]: action.word } };
  }
}

async function fetchSnapshot(roomId: string): Promise<Omit<RoomState, 'loaded' | 'secrets'>> {
  const { data: room, error } = await supabase.from('rooms').select('*').eq('id', roomId).maybeSingle();
  if (error) throw error;
  const playersQ = supabase.from('players').select('*').eq('room_id', roomId);
  if (!room?.current_game_id) {
    const { data: players } = await playersQ;
    return { room, players: byId(players), games: {}, turns: {}, words: {}, clues: {}, guesses: {} };
  }
  const gameId = room.current_game_id as string;
  const [{ data: players }, { data: games }, { data: turns }, { data: words }] = await Promise.all([
    playersQ,
    supabase.from('games').select('*').eq('id', gameId),
    supabase.from('turns').select('*').eq('game_id', gameId),
    supabase.from('turn_words').select('*').eq('game_id', gameId),
  ]);
  const turnId = (games?.[0] as Game | undefined)?.current_turn_id;
  const [{ data: clues }, { data: guesses }] = turnId
    ? await Promise.all([
      supabase.from('clues').select('*').eq('turn_id', turnId),
      supabase.from('guesses').select('*').eq('turn_id', turnId),
    ])
    : [{ data: [] }, { data: [] }];
  return {
    room, players: byId(players), games: byId(games), turns: byId(turns), words: byId(words),
    clues: byId(clues as Clue[]), guesses: byId(guesses as Guess[]),
  };
}

export function useRoom(roomId: string) {
  const [state, dispatch] = useReducer(reducer, empty);
  const [connected, setConnected] = useState(true);
  const loadSeq = useRef(0);
  const buffer = useRef<Upsert[] | null>(null);
  const reload = useRef<() => void>(() => {});

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const seq = ++loadSeq.current;
      buffer.current = [];
      try {
        const snapshot = await fetchSnapshot(roomId);
        if (!cancelled && seq === loadSeq.current) {
          dispatch({ type: 'load', snapshot, replay: buffer.current ?? [] });
          buffer.current = null;
        }
      } catch (e) {
        console.error('Snapshot failed', e);
        if (!cancelled) setTimeout(load, 2000);
      }
    };

    reload.current = load;

    const apply = (action: Upsert) => {
      buffer.current?.push(action);
      dispatch(action);
    };

    const channel = supabase.channel(`room:${roomId}`);
    const tables: Table[] = ['players', 'games', 'turns', 'turn_words', 'clues', 'guesses'];
    for (const table of tables) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `room_id=eq.${roomId}` }, (payload) => {
        if (payload.eventType !== 'DELETE') apply({ type: 'upsert', table, row: payload.new as { id: string } });
      });
    }
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, (payload) => {
      if (payload.eventType === 'DELETE') return;
      apply({ type: 'upsert', table: 'rooms', row: payload.new as { id: string } });
      // Room changes are rare (status, host, settings) and may mean a new game:
      // refetch so its rows arrive in one consistent go.
      load();
    });
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') { setConnected(true); load(); }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') setConnected(false);
    });

    // Catch up when a phone wakes up or comes back online.
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', load);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', load);
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  return {
    state,
    connected,
    reload: () => reload.current(),
    setSecret: (id: string, word: string) => dispatch({ type: 'secret', id, word }),
  };
}

/** The clue-giver fetches their own word (RLS lets nobody else read it). */
export async function fetchSecret(turnWordId: string): Promise<string | null> {
  const { data } = await supabase.from('word_secrets').select('word').eq('turn_word_id', turnWordId).maybeSingle();
  return (data?.word as string | undefined) ?? null;
}
