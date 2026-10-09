-- Playtest changes: 2-8 agents, turn lengths 60/90/120s (default 90),
-- and no difficulty ladder.

alter table public.rooms drop constraint rooms_turn_seconds_check;
update public.rooms set turn_seconds = 90 where turn_seconds not in (60, 90, 120);
alter table public.rooms alter column turn_seconds set default 90;
alter table public.rooms add constraint rooms_turn_seconds_check check (turn_seconds in (60, 90, 120));

-- Every word now comes from the 3-5 banned-letter pool, at random (no ladder).
-- If a long game uses up that pool, the nearest harder words are used.
drop function public.ll_draw_word(uuid, int, timestamptz);
create or replace function public.ll_draw_word(p_turn uuid, p_shown timestamptz) returns uuid
language plpgsql as $$
declare v_game uuid; v_room uuid; w public.words; v_seq int; v_id uuid;
begin
  select game_id, room_id into v_game, v_room from public.turns where id = p_turn;
  select * into w from public.words
  where not exists (select 1 from public.word_secrets s where s.game_id = v_game and s.word_id = words.id)
  order by greatest(0, banned_count - 5, 3 - banned_count), random()
  limit 1;
  if not found then perform public.ll_fail('The word list has run dry.'); end if;
  select coalesce(max(seq), 0) + 1 into v_seq from public.turn_words where turn_id = p_turn;
  insert into public.turn_words (turn_id, game_id, room_id, seq, level, length, status, shown_at)
  values (p_turn, v_game, v_room, v_seq, w.level, char_length(w.word), 'active', p_shown)
  returning id into v_id;
  insert into public.word_secrets (turn_word_id, game_id, word_id, word, banned_count)
  values (v_id, v_game, w.id, w.word, w.banned_count);
  return v_id;
end $$;

create or replace function public.ll_begin_turn(p_game uuid, p_index int, p_start timestamptz) returns void
language plpgsql as $$
declare g public.games; n int; v_turn uuid; v_brief timestamptz := p_start + interval '3 seconds';
begin
  select * into g from public.games where id = p_game;
  n := array_length(g.turn_order, 1);
  insert into public.turns (game_id, room_id, turn_index, round, turn_no, giver_id, phase, phase_ends_at, started_at)
  values (p_game, g.room_id, p_index, (p_index / n) + 1, (p_index % n) + 1, g.turn_order[(p_index % n) + 1],
          'briefing', v_brief, p_start)
  returning id into v_turn;
  update public.games set current_turn_id = v_turn where id = p_game;
  perform public.ll_draw_word(v_turn, v_brief);
end $$;

create or replace function public.ll_guess(p_user uuid, p_room uuid, p_text text) returns jsonb
language plpgsql as $$
declare r public.rooms; me public.players; g public.games; t public.turns; tw public.turn_words; s public.word_secrets;
begin
  select * into r from public.rooms where id = p_room for share;
  me := public.ll_me(p_user, p_room);
  if r.status <> 'playing' then perform public.ll_fail('No mission in progress.'); end if;
  if me.is_spectator then perform public.ll_fail('Spectators join in from the next mission.'); end if;
  select * into g from public.games where id = r.current_game_id;
  select * into t from public.turns where id = g.current_turn_id;
  if t.giver_id = me.id then perform public.ll_fail('You''re the clue-giver this turn.'); end if;
  if t.phase = 'briefing' then perform public.ll_fail('Hold on: the briefing is still running.'); end if;
  if t.phase <> 'clue' or t.phase_ends_at <= now() then perform public.ll_fail('Time''s up.'); end if;

  select * into tw from public.turn_words where turn_id = t.id and status = 'active' for update;
  if not found then
    return jsonb_build_object('correct', false, 'late', true);  -- someone cracked it a moment earlier
  end if;
  select * into s from public.word_secrets where turn_word_id = tw.id;

  if p_text = s.word then
    perform public.ll_close_word(t.id, 'cracked', me.id, now());
    insert into public.guesses (room_id, turn_id, turn_word_id, player_id, text, correct)
    values (p_room, t.id, tw.id, me.id, p_text, true);
    perform public.ll_draw_word(t.id, now());
    return jsonb_build_object('correct', true, 'word', s.word);
  end if;

  insert into public.guesses (room_id, turn_id, turn_word_id, player_id, text, correct)
  values (p_room, t.id, tw.id, me.id, p_text, false);
  return jsonb_build_object('correct', false);
end $$;

create or replace function public.ll_pass(p_user uuid, p_room uuid) returns jsonb
language plpgsql as $$
declare r public.rooms; me public.players; g public.games; t public.turns;
begin
  select * into r from public.rooms where id = p_room for share;
  me := public.ll_me(p_user, p_room);
  if r.status <> 'playing' then perform public.ll_fail('No mission in progress.'); end if;
  select * into g from public.games where id = r.current_game_id;
  select * into t from public.turns where id = g.current_turn_id for update;
  if t.giver_id <> me.id then perform public.ll_fail('Only the clue-giver can pass.'); end if;
  if t.phase not in ('briefing', 'clue') or t.phase_ends_at <= now() then perform public.ll_fail('Time''s up.'); end if;
  if t.pass_used then perform public.ll_fail('You''ve used your pass this turn.'); end if;
  perform 1 from public.turn_words where turn_id = t.id and status = 'active' for update;
  perform public.ll_close_word(t.id, 'passed', null, now());
  update public.turns set pass_used = true where id = t.id;
  perform public.ll_draw_word(t.id,
    case when t.phase = 'briefing' then greatest(now(), t.phase_ends_at) else now() end);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.ll_join_room(p_user uuid, p_code text, p_codename text) returns jsonb
language plpgsql as $$
declare r public.rooms; p public.players; q public.players; g public.games; v_seat int; v_in_game boolean; v_id uuid;
begin
  select * into r from public.rooms where code = upper(p_code) for update;
  if not found then perform public.ll_fail('No case with that number. Check it and try again.'); end if;
  select * into g from public.games where id = r.current_game_id;
  select * into p from public.players where room_id = r.id and user_id = p_user;

  if found and p.left_at is null then
    update public.players set last_seen_at = now() where id = p.id;
    return jsonb_build_object('room_id', r.id, 'code', r.code, 'player_id', p.id);
  end if;

  if (select count(*) from public.players where room_id = r.id and left_at is null) >= 8 then
    perform public.ll_fail('This case is full: 8 agents already.');
  end if;

  if p.id is not null then
    -- Returning agent: same row (keeps their score), optionally a new codename.
    if p_codename is not null and lower(p_codename) <> p.codename_lower then
      update public.players set codename = p_codename where id = p.id;
    end if;
    if exists (select 1 from public.players where room_id = r.id and left_at is null
               and codename_lower = lower(coalesce(p_codename, p.codename)) and id <> p.id) then
      perform public.ll_fail(format('Agent %s is already on this case. Pick another codename.', coalesce(p_codename, p.codename)));
    end if;
    v_in_game := r.status = 'playing' and p.id = any (g.turn_order);
    update public.players
    set left_at = null, last_seen_at = now(), is_spectator = (r.status <> 'lobby' and not v_in_game)
    where id = p.id;
    perform public.ll_fix_host(r.id);
    return jsonb_build_object('room_id', r.id, 'code', r.code, 'player_id', p.id);
  end if;

  if p_codename is null then perform public.ll_fail('Enter a codename first.'); end if;
  select * into q from public.players where room_id = r.id and left_at is null and codename_lower = lower(p_codename);
  if found then
    -- An agent who lost their tab can reclaim their seat once it has gone quiet.
    if q.last_seen_at < now() - interval '60 seconds' then
      update public.players set user_id = p_user, last_seen_at = now() where id = q.id;
      return jsonb_build_object('room_id', r.id, 'code', r.code, 'player_id', q.id);
    end if;
    perform public.ll_fail(format('Agent %s is already on this case. Pick another codename.', q.codename));
  end if;
  select coalesce(max(seat), 0) + 1 into v_seat from public.players where room_id = r.id;
  insert into public.players (room_id, user_id, codename, seat, is_spectator)
  values (r.id, p_user, p_codename, v_seat, r.status <> 'lobby')
  returning id into v_id;
  perform public.ll_fix_host(r.id);
  return jsonb_build_object('room_id', r.id, 'code', r.code, 'player_id', v_id);
end $$;

create or replace function public.ll_start_game(p_user uuid, p_room uuid) returns jsonb
language plpgsql as $$
declare r public.rooms; me public.players; v_order uuid[]; v_game uuid;
begin
  select * into r from public.rooms where id = p_room for update;
  me := public.ll_me(p_user, p_room);
  if r.host_player_id is distinct from me.id then perform public.ll_fail('Only the host can begin the mission.'); end if;
  if r.status <> 'lobby' then perform public.ll_fail('The mission has already begun.'); end if;
  select array_agg(id order by seat) into v_order from public.players where room_id = p_room and left_at is null;
  if coalesce(array_length(v_order, 1), 0) < 2 then perform public.ll_fail('Needs at least 2 agents.'); end if;
  update public.players set is_spectator = false, last_seen_at = greatest(last_seen_at, now() - interval '30 seconds')
  where room_id = p_room and left_at is null;
  insert into public.games (room_id, rounds, turn_seconds, turn_order)
  values (p_room, r.rounds, r.turn_seconds, v_order) returning id into v_game;
  update public.rooms set status = 'playing', current_game_id = v_game where id = p_room;
  perform public.ll_begin_turn(v_game, 0, now());
  return jsonb_build_object('ok', true, 'game_id', v_game);
end $$;

do $$
declare f text;
begin
  for f in
    select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'll\_%' and p.proname not in ('ll_is_member', 'll_is_giver_of')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
