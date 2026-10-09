-- The clue-giver may read a secret word only while their turn is live.
create or replace function public.ll_is_giver_of(p_turn_word uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.turn_words tw
    join public.turns t on t.id = tw.turn_id
    join public.players p on p.id = t.giver_id
    where tw.id = p_turn_word and p.user_id = auth.uid() and p.left_at is null
      and t.phase in ('briefing', 'clue')
  );
$$;
