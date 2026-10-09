-- Letterless schema.
-- Phones may only READ rows for rooms they are in (RLS). Every write goes through
-- the `referee` edge function, which calls the ll_* functions below with the
-- service role. The secret word lives in word_secrets, readable only by the
-- clue-giver of that turn.

-- ---------------------------------------------------------------- tables

create table public.words (
  id serial primary key,
  word text not null unique check (word ~ '^[A-Z]+$'),
  level smallint not null check (level between 1 and 4),
  banned_count smallint not null
);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{5}$'),
  host_player_id uuid,
  status text not null default 'lobby' check (status in ('lobby', 'playing', 'finished')),
  rounds smallint not null default 2 check (rounds in (1, 2, 3)),
  turn_seconds smallint not null default 60 check (turn_seconds in (45, 60, 90)),
  current_game_id uuid,
  created_at timestamptz not null default now()
);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null,
  codename text not null check (codename ~ '^[A-Za-z]{2,10}$'),
  codename_lower text generated always as (lower(codename)) stored,
  seat int not null,
  is_spectator boolean not null default false,
  left_at timestamptz,
  last_seen_at timestamptz not null default now(),
  joined_at timestamptz not null default now(),
  unique (room_id, user_id)
);
-- Codenames are unique among agents currently in the room (ignoring capitals).
create unique index players_room_codename_active on public.players (room_id, codename_lower) where left_at is null;

alter table public.rooms
  add constraint rooms_host_fk foreign key (host_player_id) references public.players (id) on delete set null;

create table public.games (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  rounds smallint not null,
  turn_seconds smallint not null,
  turn_order uuid[] not null,
  status text not null default 'playing' check (status in ('playing', 'finished')),
  current_turn_id uuid,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

alter table public.rooms
  add constraint rooms_game_fk foreign key (current_game_id) references public.games (id) on delete set null;

create table public.turns (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  room_id uuid not null references public.rooms (id) on delete cascade,
  turn_index int not null,           -- 0-based position in the whole game
  round smallint not null,
  turn_no smallint not null,         -- 1-based position within the round
  giver_id uuid not null references public.players (id),
  phase text not null check (phase in ('briefing', 'clue', 'report', 'done')),
  phase_ends_at timestamptz not null,
  pass_used boolean not null default false,
  next_giver_id uuid references public.players (id),
  started_at timestamptz not null default now(),
  unique (game_id, turn_index)
);

alter table public.games
  add constraint games_turn_fk foreign key (current_turn_id) references public.turns (id) on delete set null;

-- One row per word shown in a turn. Guessers can see this row, so it must
-- never hold the word (or anything that identifies it) until it is revealed.
create table public.turn_words (
  id uuid primary key default gen_random_uuid(),
  turn_id uuid not null references public.turns (id) on delete cascade,
  game_id uuid not null references public.games (id) on delete cascade,
  room_id uuid not null references public.rooms (id) on delete cascade,
  seq smallint not null,
  level smallint not null,
  length smallint not null,
  status text not null default 'active' check (status in ('active', 'cracked', 'passed', 'unsolved')),
  cracked_by uuid references public.players (id),
  shown_at timestamptz not null,
  ended_at timestamptz,
  revealed_word text,
  banned_count smallint,             -- copied in on reveal
  unique (turn_id, seq)
);
create unique index turn_words_one_active on public.turn_words (turn_id) where status = 'active';

create table public.word_secrets (
  turn_word_id uuid primary key references public.turn_words (id) on delete cascade,
  game_id uuid not null references public.games (id) on delete cascade,
  word_id int not null references public.words (id),
  word text not null,
  banned_count smallint not null,
  unique (game_id, word_id)          -- no repeats within a game
);

create table public.clues (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  turn_id uuid not null references public.turns (id) on delete cascade,
  turn_word_id uuid not null references public.turn_words (id) on delete cascade,
  player_id uuid not null references public.players (id),
  text text not null check (char_length(text) between 1 and 40),
  created_at timestamptz not null default now()
);

create table public.guesses (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  turn_id uuid not null references public.turns (id) on delete cascade,
  turn_word_id uuid not null references public.turn_words (id) on delete cascade,
  player_id uuid not null references public.players (id),
  text text not null check (text ~ '^[A-Z]{1,20}$'),
  correct boolean not null default false,
  created_at timestamptz not null default now()
);

create index players_room on public.players (room_id);
create index players_user on public.players (user_id);
create index games_room on public.games (room_id);
create index turns_game on public.turns (game_id);
create index turn_words_game on public.turn_words (game_id);
create index clues_turn on public.clues (turn_id);
create index guesses_turn on public.guesses (turn_id);

-- ---------------------------------------------------------------- row level security

create or replace function public.ll_is_member(p_room uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.players
    where room_id = p_room and user_id = auth.uid() and left_at is null
  );
$$;

create or replace function public.ll_is_giver_of(p_turn_word uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.turn_words tw
    join public.turns t on t.id = tw.turn_id
    join public.players p on p.id = t.giver_id
    where tw.id = p_turn_word and p.user_id = auth.uid() and p.left_at is null
  );
$$;

alter table public.words enable row level security;          -- no policies: server only
alter table public.rooms enable row level security;
alter table public.players enable row level security;
alter table public.games enable row level security;
alter table public.turns enable row level security;
alter table public.turn_words enable row level security;
alter table public.word_secrets enable row level security;
alter table public.clues enable row level security;
alter table public.guesses enable row level security;

create policy "members read rooms" on public.rooms for select to authenticated using (public.ll_is_member(id));
create policy "members read players" on public.players for select to authenticated using (public.ll_is_member(room_id));
create policy "members read games" on public.games for select to authenticated using (public.ll_is_member(room_id));
create policy "members read turns" on public.turns for select to authenticated using (public.ll_is_member(room_id));
create policy "members read turn words" on public.turn_words for select to authenticated using (public.ll_is_member(room_id));
create policy "members read clues" on public.clues for select to authenticated using (public.ll_is_member(room_id));
create policy "members read guesses" on public.guesses for select to authenticated using (public.ll_is_member(room_id));
create policy "giver reads own word" on public.word_secrets for select to authenticated using (public.ll_is_giver_of(turn_word_id));

-- Belt and braces: phones never write directly.
revoke insert, update, delete, truncate on all tables in schema public from anon, authenticated;
revoke all on public.words from anon, authenticated;
revoke all on public.word_secrets from anon;

-- ---------------------------------------------------------------- realtime

alter publication supabase_realtime add table
  public.rooms, public.players, public.games, public.turns, public.turn_words, public.clues, public.guesses;

-- ---------------------------------------------------------------- referee helpers (service role only)

create or replace function public.ll_fail(msg text) returns void
language plpgsql as $$
begin
  raise exception using errcode = 'P0001', message = msg;
end $$;

-- The caller's active player row in a room.
create or replace function public.ll_me(p_user uuid, p_room uuid) returns public.players
language plpgsql as $$
declare v public.players;
begin
  select * into v from public.players where room_id = p_room and user_id = p_user and left_at is null;
  if not found then perform public.ll_fail('You are not on this case.'); end if;
  return v;
end $$;

-- Give the room a host if it has none: the next agent in turn (seat) order.
create or replace function public.ll_fix_host(p_room uuid) returns void
language plpgsql as $$
declare v_old uuid; v_seat int; v_new uuid;
begin
  select host_player_id into v_old from public.rooms where id = p_room;
  if v_old is not null and exists (select 1 from public.players where id = v_old and left_at is null) then
    return;
  end if;
  select seat into v_seat from public.players where id = v_old;
  select id into v_new from public.players
  where room_id = p_room and left_at is null
  order by is_spectator, (seat > coalesce(v_seat, 0)) desc, seat
  limit 1;
  update public.rooms set host_player_id = v_new where id = p_room;
end $$;

-- Draw an unused word as close to p_level as possible and put it on screen.
create or replace function public.ll_draw_word(p_turn uuid, p_level int, p_shown timestamptz) returns uuid
language plpgsql as $$
declare v_game uuid; v_room uuid; w public.words; v_seq int; v_id uuid;
begin
  select game_id, room_id into v_game, v_room from public.turns where id = p_turn;
  select * into w from public.words
  where not exists (select 1 from public.word_secrets s where s.game_id = v_game and s.word_id = words.id)
  order by abs(level - p_level), random()
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

-- Reveal and close the active word of a turn.
create or replace function public.ll_close_word(p_turn uuid, p_status text, p_by uuid, p_at timestamptz) returns public.turn_words
language plpgsql as $$
declare v public.turn_words;
begin
  update public.turn_words tw
  set status = p_status, cracked_by = p_by, ended_at = p_at,
      revealed_word = s.word, banned_count = s.banned_count
  from public.word_secrets s
  where s.turn_word_id = tw.id and tw.turn_id = p_turn and tw.status = 'active'
  returning tw.* into v;
  return v;
end $$;

-- Agents still in the game.
create or replace function public.ll_active_in_game(p_game uuid) returns int
language sql stable as $$
  select count(*)::int from public.players p, public.games g
  where g.id = p_game and p.id = any (g.turn_order) and p.left_at is null;
$$;

-- Index of the next turn to play after p_after, skipping agents who have left
-- (or gone silent for over a minute). Null when the game is over.
create or replace function public.ll_next_turn(p_game uuid, p_after int) returns int
language plpgsql as $$
declare g public.games; n int; total int; j int; p public.players;
begin
  select * into g from public.games where id = p_game;
  n := array_length(g.turn_order, 1);
  total := n * g.rounds;
  j := p_after + 1;
  while j < total loop
    if public.ll_active_in_game(p_game) < 2 then return null; end if;
    select * into p from public.players where id = g.turn_order[(j % n) + 1];
    if p.left_at is null and p.last_seen_at < now() - interval '60 seconds' then
      update public.players set left_at = now() where id = p.id;
      perform public.ll_fix_host(g.room_id);
      p.left_at := now();
    end if;
    if p.left_at is null then return j; end if;
    j := j + 1;
  end loop;
  return null;
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
  perform public.ll_draw_word(v_turn, 1, v_brief);
end $$;

create or replace function public.ll_end_turn(p_turn uuid, p_at timestamptz) returns void
language plpgsql as $$
declare t public.turns; g public.games; v_next int;
begin
  select * into t from public.turns where id = p_turn;
  select * into g from public.games where id = t.game_id;
  perform public.ll_close_word(p_turn, 'unsolved', null, p_at);
  v_next := public.ll_next_turn(g.id, t.turn_index);
  update public.turns
  set phase = 'report', phase_ends_at = p_at + interval '5 seconds',
      next_giver_id = case when v_next is null then null
                           else g.turn_order[(v_next % array_length(g.turn_order, 1)) + 1] end
  where id = p_turn;
end $$;

create or replace function public.ll_finish_game(p_game uuid, p_at timestamptz) returns void
language plpgsql as $$
declare v_room uuid;
begin
  update public.turns set phase = 'done' where game_id = p_game and phase <> 'done';
  update public.games set status = 'finished', ended_at = p_at where id = p_game returning room_id into v_room;
  update public.rooms set status = 'finished' where id = v_room;
end $$;

-- ---------------------------------------------------------------- referee actions

create or replace function public.ll_create_room(p_user uuid, p_codename text) returns jsonb
language plpgsql as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text; v_room uuid; v_player uuid;
begin
  loop
    select string_agg(substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1), '')
      into v_code from generate_series(1, 5);
    exit when not exists (select 1 from public.rooms where code = v_code);
  end loop;
  insert into public.rooms (code) values (v_code) returning id into v_room;
  insert into public.players (room_id, user_id, codename, seat) values (v_room, p_user, p_codename, 1)
    returning id into v_player;
  update public.rooms set host_player_id = v_player where id = v_room;
  return jsonb_build_object('room_id', v_room, 'code', v_code, 'player_id', v_player);
end $$;

-- Join by case number. Also used to come back after a refresh or after leaving.
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

  if (select count(*) from public.players where room_id = r.id and left_at is null) >= 10 then
    perform public.ll_fail('This case is full: 10 agents already.');
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

create or replace function public.ll_update_settings(p_user uuid, p_room uuid, p_rounds int, p_turn_seconds int) returns jsonb
language plpgsql as $$
declare r public.rooms; me public.players;
begin
  select * into r from public.rooms where id = p_room for update;
  me := public.ll_me(p_user, p_room);
  if r.host_player_id is distinct from me.id then perform public.ll_fail('Only the host can change mission settings.'); end if;
  if r.status <> 'lobby' then perform public.ll_fail('Settings are locked once the mission begins.'); end if;
  update public.rooms
  set rounds = coalesce(p_rounds, rounds), turn_seconds = coalesce(p_turn_seconds, turn_seconds)
  where id = p_room;
  return jsonb_build_object('ok', true);
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
  if coalesce(array_length(v_order, 1), 0) < 3 then perform public.ll_fail('Needs at least 3 agents.'); end if;
  update public.players set is_spectator = false, last_seen_at = greatest(last_seen_at, now() - interval '30 seconds')
  where room_id = p_room and left_at is null;
  insert into public.games (room_id, rounds, turn_seconds, turn_order)
  values (p_room, r.rounds, r.turn_seconds, v_order) returning id into v_game;
  update public.rooms set status = 'playing', current_game_id = v_game where id = p_room;
  perform public.ll_begin_turn(v_game, 0, now());
  return jsonb_build_object('ok', true, 'game_id', v_game);
end $$;

-- Move the game clock along. Safe to call by every phone at once: the room
-- row lock means only one caller advances, the rest see it already done.
create or replace function public.ll_advance(p_user uuid, p_room uuid) returns jsonb
language plpgsql as $$
declare r public.rooms; g public.games; t public.turns; v_base timestamptz; v_next int; i int := 0;
begin
  update public.players set last_seen_at = now() where room_id = p_room and user_id = p_user and left_at is null;
  select * into r from public.rooms where id = p_room for update;
  if not found or r.status <> 'playing' then return jsonb_build_object('ok', true); end if;
  loop
    i := i + 1;
    exit when i > 20;
    select * into g from public.games where id = r.current_game_id;
    exit when g.status <> 'playing';
    select * into t from public.turns where id = g.current_turn_id;
    exit when t.phase_ends_at > now();
    -- If nobody was around to advance on time, start the next phase now rather
    -- than replaying missed phases in an instant.
    v_base := case when now() - t.phase_ends_at > interval '2 seconds' then now() else t.phase_ends_at end;
    if t.phase = 'briefing' then
      update public.turns set phase = 'clue', phase_ends_at = v_base + make_interval(secs => g.turn_seconds) where id = t.id;
      update public.turn_words set shown_at = v_base where turn_id = t.id and status = 'active';
    elsif t.phase = 'clue' then
      perform public.ll_end_turn(t.id, v_base);
    elsif t.phase = 'report' then
      update public.turns set phase = 'done' where id = t.id;
      v_next := public.ll_next_turn(g.id, t.turn_index);
      if v_next is null then
        perform public.ll_finish_game(g.id, v_base);
      else
        perform public.ll_begin_turn(g.id, v_next, v_base);
      end if;
    else
      exit;
    end if;
  end loop;
  perform public.ll_fix_host(p_room);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.ll_send_clue(p_user uuid, p_room uuid, p_text text) returns jsonb
language plpgsql as $$
declare r public.rooms; me public.players; g public.games; t public.turns; tw public.turn_words; s public.word_secrets; v_bad text;
begin
  select * into r from public.rooms where id = p_room for share;
  me := public.ll_me(p_user, p_room);
  if r.status <> 'playing' then perform public.ll_fail('No mission in progress.'); end if;
  select * into g from public.games where id = r.current_game_id;
  select * into t from public.turns where id = g.current_turn_id;
  if t.giver_id <> me.id then perform public.ll_fail('Only the clue-giver can send clues.'); end if;
  if t.phase = 'briefing' then perform public.ll_fail('Clues open when the briefing ends.'); end if;
  if t.phase <> 'clue' or t.phase_ends_at <= now() then perform public.ll_fail('Time''s up.'); end if;
  select * into tw from public.turn_words where turn_id = t.id and status = 'active';
  select * into s from public.word_secrets where turn_word_id = tw.id;
  select c into v_bad from regexp_split_to_table(upper(p_text), '') c where c ~ '[A-Z]' and position(c in s.word) > 0 limit 1;
  if v_bad is not null then perform public.ll_fail(format('%s is redacted. That key is locked.', v_bad)); end if;
  insert into public.clues (room_id, turn_id, turn_word_id, player_id, text)
  values (p_room, t.id, tw.id, me.id, upper(p_text));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.ll_guess(p_user uuid, p_room uuid, p_text text) returns jsonb
language plpgsql as $$
declare r public.rooms; me public.players; g public.games; t public.turns; tw public.turn_words; s public.word_secrets; v_cracked int;
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
    select count(*) into v_cracked from public.turn_words where turn_id = t.id and status = 'cracked';
    perform public.ll_draw_word(t.id, least(4, v_cracked + 1), now());
    return jsonb_build_object('correct', true, 'word', s.word);
  end if;

  insert into public.guesses (room_id, turn_id, turn_word_id, player_id, text, correct)
  values (p_room, t.id, tw.id, me.id, p_text, false);
  return jsonb_build_object('correct', false);
end $$;

create or replace function public.ll_pass(p_user uuid, p_room uuid) returns jsonb
language plpgsql as $$
declare r public.rooms; me public.players; g public.games; t public.turns; v_cracked int;
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
  select count(*) into v_cracked from public.turn_words where turn_id = t.id and status = 'cracked';
  perform public.ll_draw_word(t.id, least(4, v_cracked + 1),
    case when t.phase = 'briefing' then greatest(now(), t.phase_ends_at) else now() end);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.ll_leave(p_user uuid, p_room uuid) returns jsonb
language plpgsql as $$
declare r public.rooms; me public.players; g public.games; t public.turns; v_next int;
begin
  select * into r from public.rooms where id = p_room for update;
  select * into me from public.players where room_id = p_room and user_id = p_user and left_at is null;
  if not found then return jsonb_build_object('ok', true); end if;
  update public.players set left_at = now() where id = me.id;

  if r.status = 'playing' then
    select * into g from public.games where id = r.current_game_id;
    select * into t from public.turns where id = g.current_turn_id;
    if public.ll_active_in_game(g.id) < 2 then
      if t.phase in ('briefing', 'clue') then perform public.ll_close_word(t.id, 'unsolved', null, now()); end if;
      perform public.ll_finish_game(g.id, now());
    elsif t.giver_id = me.id and t.phase in ('briefing', 'clue') then
      perform public.ll_end_turn(t.id, now());
    elsif t.phase = 'report' and t.next_giver_id = me.id then
      v_next := public.ll_next_turn(g.id, t.turn_index);
      update public.turns
      set next_giver_id = case when v_next is null then null
                               else g.turn_order[(v_next % array_length(g.turn_order, 1)) + 1] end
      where id = t.id;
    end if;
  end if;

  perform public.ll_fix_host(p_room);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.ll_play_again(p_user uuid, p_room uuid) returns jsonb
language plpgsql as $$
declare r public.rooms; me public.players;
begin
  select * into r from public.rooms where id = p_room for update;
  me := public.ll_me(p_user, p_room);
  if r.host_player_id is distinct from me.id then perform public.ll_fail('Only the host can reopen the case.'); end if;
  if r.status <> 'finished' then perform public.ll_fail('The mission is still running.'); end if;
  update public.players set is_spectator = false where room_id = p_room and left_at is null;
  update public.rooms set status = 'lobby', current_game_id = null where id = p_room;
  return jsonb_build_object('ok', true);
end $$;

-- Referee functions are for the service role only.
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
