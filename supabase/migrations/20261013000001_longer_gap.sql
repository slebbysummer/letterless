-- Between turns lasts 12 seconds (was 8): more time to read the turn report and get ready.
create or replace function public.ll_end_turn(p_turn uuid, p_at timestamptz) returns void
language plpgsql as $$
declare t public.turns; g public.games; v_next int;
begin
  select * into t from public.turns where id = p_turn;
  select * into g from public.games where id = t.game_id;
  perform public.ll_close_word(p_turn, 'unsolved', null, p_at);
  v_next := public.ll_next_turn(g.id, t.turn_index);
  update public.turns
  set phase = 'report', phase_ends_at = p_at + interval '12 seconds',
      next_giver_id = case when v_next is null then null
                           else g.turn_order[(v_next % array_length(g.turn_order, 1)) + 1] end
  where id = p_turn;
end $$;

revoke all on function public.ll_end_turn(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.ll_end_turn(uuid, timestamptz) to service_role;
