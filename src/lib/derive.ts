import type { RoomState } from './useRoom.ts';
import type { Clue, Game, Guess, Player, Turn, TurnWord } from './types.ts';

export interface View {
  room: NonNullable<RoomState['room']>;
  players: Player[];               // everyone ever in the room, by seat
  active: Player[];                // still in the room
  me: Player | null;
  isHost: boolean;
  byId: Record<string, Player>;
  game: Game | null;
  gameWords: TurnWord[];
  turn: Turn | null;
  turnWords: TurnWord[];           // this turn's words, in order
  word: TurnWord | null;           // the word on screen now
  clues: Clue[];                   // clues for the word on screen
  guesses: Guess[];                // guesses for the word on screen
  isGiver: boolean;
  secret: string | null;
}

const bySeat = (a: Player, b: Player) => a.seat - b.seat;
const byTime = <T extends { created_at: string }>(a: T, b: T) => a.created_at.localeCompare(b.created_at);

export function derive(s: RoomState, userId: string): View | null {
  const room = s.room;
  if (!room) return null;
  const players = Object.values(s.players).filter((p) => p.room_id === room.id).sort(bySeat);
  const active = players.filter((p) => !p.left_at);
  const me = active.find((p) => p.user_id === userId) ?? null;
  const byId = Object.fromEntries(players.map((p) => [p.id, p]));
  const game = room.current_game_id ? s.games[room.current_game_id] ?? null : null;
  const gameWords = game ? Object.values(s.words).filter((w) => w.game_id === game.id) : [];
  const turn = game?.current_turn_id ? s.turns[game.current_turn_id] ?? null : null;
  const turnWords = turn ? gameWords.filter((w) => w.turn_id === turn.id).sort((a, b) => a.seq - b.seq) : [];
  const word = turnWords.find((w) => w.status === 'active') ?? null;
  const clues = word ? Object.values(s.clues).filter((c) => c.turn_word_id === word.id).sort(byTime) : [];
  const guesses = word ? Object.values(s.guesses).filter((g) => g.turn_word_id === word.id).sort(byTime) : [];
  const isGiver = !!(me && turn && turn.giver_id === me.id);
  return {
    room, players, active, me, isHost: !!me && room.host_player_id === me.id, byId,
    game, gameWords, turn, turnWords, word, clues, guesses, isGiver,
    secret: isGiver && word ? s.secrets[word.id] ?? null : null,
  };
}

export const agent = (p: Player | undefined | null) => (p ? `Agent ${p.codename}` : 'An agent');

export interface ScoreRow {
  player: Player;
  gave: number;
  cracked: number;
  total: number;
  rank: number;
}

/** Leaderboard for a game. Ties share a rank (1, 1, 3). */
export function scores(game: Game, words: TurnWord[], turns: Record<string, Turn>, byId: Record<string, Player>): ScoreRow[] {
  const rows = game.turn_order.filter((id) => byId[id]).map((id) => {
    const cracked = words.filter((w) => w.status === 'cracked' && w.cracked_by === id).length;
    const gave = words.filter((w) => w.status === 'cracked' && turns[w.turn_id]?.giver_id === id).length;
    return { player: byId[id], gave, cracked, total: gave + cracked, rank: 0 };
  });
  rows.sort((a, b) => b.total - a.total || b.cracked - a.cracked || a.player.seat - b.player.seat);
  rows.forEach((r, i) => { r.rank = i > 0 && rows[i - 1].total === r.total ? rows[i - 1].rank : i + 1; });
  return rows;
}

export function pointsFor(playerId: string, words: TurnWord[], turns: Record<string, Turn>): number {
  return words.filter((w) => w.status === 'cracked' && (w.cracked_by === playerId || turns[w.turn_id]?.giver_id === playerId)).length;
}

export interface Highlight { word: string; by: Player | undefined; detail: string }

export function highlights(words: TurnWord[], byId: Record<string, Player>): { hardest: Highlight | null; fastest: Highlight | null } {
  const cracked = words.filter((w) => w.status === 'cracked' && w.revealed_word && w.ended_at)
    .sort((a, b) => a.ended_at!.localeCompare(b.ended_at!));
  if (cracked.length === 0) return { hardest: null, fastest: null };
  const hardest = cracked.reduce((best, w) => ((w.banned_count ?? 0) > (best.banned_count ?? 0) ? w : best));
  const secs = (w: TurnWord) => Math.max(0, (Date.parse(w.ended_at!) - Date.parse(w.shown_at)) / 1000);
  const fastest = cracked.reduce((best, w) => (secs(w) < secs(best) ? w : best));
  const s = Math.max(1, Math.round(secs(fastest)));
  return {
    hardest: { word: hardest.revealed_word!, by: byId[hardest.cracked_by!], detail: `${hardest.banned_count} letters banned` },
    fastest: { word: fastest.revealed_word!, by: byId[fastest.cracked_by!], detail: `${s} second${s === 1 ? '' : 's'}` },
  };
}
