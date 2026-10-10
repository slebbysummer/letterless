-- Playtest round 3:
-- * No word repeats on the same case number, across every game played on it.
-- * Between turns lasts 8 seconds (was 5).

create index if not exists turn_words_room on public.turn_words (room_id);

create or replace function public.ll_draw_word(p_turn uuid, p_shown timestamptz) returns uuid
language plpgsql as $$
declare v_game uuid; v_room uuid; w public.words; v_seq int; v_id uuid;
begin
  select game_id, room_id into v_game, v_room from public.turns where id = p_turn;
  select * into w from public.words
  where not exists (
    select 1 from public.word_secrets s join public.turn_words tw on tw.id = s.turn_word_id
    where tw.room_id = v_room and s.word_id = words.id
  )
  order by in_pool desc,
           case when in_pool then 0 else vowels_banned end,
           case when in_pool then 0 else banned_count end,
           random()
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

create or replace function public.ll_end_turn(p_turn uuid, p_at timestamptz) returns void
language plpgsql as $$
declare t public.turns; g public.games; v_next int;
begin
  select * into t from public.turns where id = p_turn;
  select * into g from public.games where id = t.game_id;
  perform public.ll_close_word(p_turn, 'unsolved', null, p_at);
  v_next := public.ll_next_turn(g.id, t.turn_index);
  update public.turns
  set phase = 'report', phase_ends_at = p_at + interval '8 seconds',
      next_giver_id = case when v_next is null then null
                           else g.turn_order[(v_next % array_length(g.turn_order, 1)) + 1] end
  where id = p_turn;
end $$;

revoke all on function public.ll_draw_word(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.ll_draw_word(uuid, timestamptz) to service_role;
revoke all on function public.ll_end_turn(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.ll_end_turn(uuid, timestamptz) to service_role;
