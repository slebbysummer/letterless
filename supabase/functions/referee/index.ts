// The referee: every game action goes through here. It checks who is calling,
// validates the input with the shared rules, then runs the matching ll_*
// database function (which holds the secret word and does the bookkeeping
// inside a single transaction).
import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
import {
  normalizeCaseCode, ROUND_OPTIONS, TURN_OPTIONS, validateClue, validateCodename, validateGuess,
} from '../_shared/rules.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY')!;
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

class UserError extends Error {}

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify({ ...body, now: Date.now() }), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function check<T>(result: { ok: true; value: T } | { ok: false; error: string }): T {
  if (!result.ok) throw new UserError(result.error);
  return result.value;
}

function uuid(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f-]{36}$/i.test(value)) throw new UserError('Missing case.');
  return value;
}

async function rpc(fn: string, args: Record<string, unknown>) {
  const { data, error } = await admin.rpc(fn, args);
  if (error) {
    if (error.code === 'P0001') throw new UserError(error.message);
    if (error.code === '23505') throw new UserError('That codename is taken on this case. Pick another.');
    console.error(fn, error);
    throw new Error(error.message);
  }
  return data as Record<string, unknown>;
}

async function userFromRequest(req: Request): Promise<string> {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new UserError('Not signed in.');
  const { data, error } = await admin.auth.getClaims(token);
  const sub = data?.claims?.sub;
  if (error || !sub || data.claims.role !== 'authenticated') throw new UserError('Your session has expired. Reload the page.');
  return sub;
}

type Body = Record<string, unknown>;
const actions: Record<string, (user: string, b: Body) => Promise<Record<string, unknown>>> = {
  create_room: (user, b) =>
    rpc('ll_create_room', { p_user: user, p_codename: check(validateCodename(String(b.codename ?? ''))) }),

  join_room: (user, b) =>
    rpc('ll_join_room', {
      p_user: user,
      p_code: check(normalizeCaseCode(String(b.code ?? ''))),
      p_codename: b.codename == null || b.codename === '' ? null : check(validateCodename(String(b.codename))),
    }),

  update_settings: (user, b) => {
    const rounds = b.rounds == null ? null : Number(b.rounds);
    const secs = b.turn_seconds == null ? null : Number(b.turn_seconds);
    if (rounds !== null && !(ROUND_OPTIONS as readonly number[]).includes(rounds)) throw new UserError('Rounds must be 1, 2 or 3.');
    if (secs !== null && !(TURN_OPTIONS as readonly number[]).includes(secs)) throw new UserError('Turn length must be 60, 90 or 120 seconds.');
    return rpc('ll_update_settings', { p_user: user, p_room: uuid(b.room_id), p_rounds: rounds, p_turn_seconds: secs });
  },

  start_game: (user, b) => rpc('ll_start_game', { p_user: user, p_room: uuid(b.room_id) }),

  send_clue: (user, b) =>
    rpc('ll_send_clue', { p_user: user, p_room: uuid(b.room_id), p_text: check(validateClue(String(b.text ?? ''))) }),

  guess: (user, b) =>
    rpc('ll_guess', { p_user: user, p_room: uuid(b.room_id), p_text: check(validateGuess(String(b.text ?? ''))) }),

  pass: (user, b) => rpc('ll_pass', { p_user: user, p_room: uuid(b.room_id) }),
  advance: (user, b) => rpc('ll_advance', { p_user: user, p_room: uuid(b.room_id) }),
  leave: (user, b) => rpc('ll_leave', { p_user: user, p_room: uuid(b.room_id) }),
  play_again: (user, b) => rpc('ll_play_again', { p_user: user, p_room: uuid(b.room_id) }),
  end_game: (user, b) => rpc('ll_end_game', { p_user: user, p_room: uuid(b.room_id) }),
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply(405, { error: 'POST only.' });
  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const action = actions[String(body.action)];
    if (!action) throw new UserError('Unknown action.');
    const user = await userFromRequest(req);
    return reply(200, await action(user, body));
  } catch (e) {
    if (e instanceof UserError) return reply(400, { error: e.message });
    console.error(e);
    return reply(500, { error: 'The referee hit a snag. Try again.' });
  }
});
