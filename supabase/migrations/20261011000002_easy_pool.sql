-- Easier word pool (playtest round 2): words that ban at most one vowel
-- (3-5 banned letters), plus short words that ban two vowels but only 3-4
-- letters in total.

create or replace function public.ll_vowels_in(p_word text) returns smallint
language sql immutable as $$
  select ((position('A' in p_word) > 0)::int + (position('E' in p_word) > 0)::int + (position('I' in p_word) > 0)::int
        + (position('O' in p_word) > 0)::int + (position('U' in p_word) > 0)::int)::smallint;
$$;

alter table public.words
  add column vowels_banned smallint generated always as (public.ll_vowels_in(word)) stored,
  add column in_pool boolean generated always as (
    (public.ll_vowels_in(word) <= 1 and banned_count between 3 and 5)
    or (public.ll_vowels_in(word) = 2 and banned_count between 3 and 4)
  ) stored;

-- Random word from the pool. If a long game uses the whole pool up, the
-- next-easiest words follow: fewest vowels banned, then fewest letters.
create or replace function public.ll_draw_word(p_turn uuid, p_shown timestamptz) returns uuid
language plpgsql as $$
declare v_game uuid; v_room uuid; w public.words; v_seq int; v_id uuid;
begin
  select game_id, room_id into v_game, v_room from public.turns where id = p_turn;
  select * into w from public.words
  where not exists (select 1 from public.word_secrets s where s.game_id = v_game and s.word_id = words.id)
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

revoke all on function public.ll_draw_word(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.ll_draw_word(uuid, timestamptz) to service_role;
