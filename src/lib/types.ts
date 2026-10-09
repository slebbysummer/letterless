export type RoomStatus = 'lobby' | 'playing' | 'finished';
export type Phase = 'briefing' | 'clue' | 'report' | 'done';
export type WordStatus = 'active' | 'cracked' | 'passed' | 'unsolved';

export interface Room {
  id: string;
  code: string;
  host_player_id: string | null;
  status: RoomStatus;
  rounds: number;
  turn_seconds: number;
  current_game_id: string | null;
}

export interface Player {
  id: string;
  room_id: string;
  user_id: string;
  codename: string;
  seat: number;
  is_spectator: boolean;
  left_at: string | null;
}

export interface Game {
  id: string;
  room_id: string;
  rounds: number;
  turn_seconds: number;
  turn_order: string[];
  status: 'playing' | 'finished';
  current_turn_id: string | null;
}

export interface Turn {
  id: string;
  game_id: string;
  turn_index: number;
  round: number;
  turn_no: number;
  giver_id: string;
  phase: Phase;
  phase_ends_at: string;
  pass_used: boolean;
  next_giver_id: string | null;
}

export interface TurnWord {
  id: string;
  turn_id: string;
  game_id: string;
  seq: number;
  level: number;
  length: number;
  status: WordStatus;
  cracked_by: string | null;
  shown_at: string;
  ended_at: string | null;
  revealed_word: string | null;
  banned_count: number | null;
}

export interface Clue {
  id: string;
  turn_id: string;
  turn_word_id: string;
  player_id: string;
  text: string;
  created_at: string;
}

export interface Guess {
  id: string;
  turn_id: string;
  turn_word_id: string;
  player_id: string;
  text: string;
  correct: boolean;
  created_at: string;
}
