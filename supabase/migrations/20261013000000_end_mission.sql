-- The host can end the mission early: everyone goes to the debrief with the
-- scores so far. The word on screen (if any) is revealed as unsolved.
create or replace function public.ll_end_game(p_user uuid, p_room uuid) returns jsonb
language plpgsql as $$
declare r public.rooms; me public.players; g public.games; t public.turns;
begin
  select * into r from public.rooms where id = p_room for update;
  me := public.ll_me(p_user, p_room);
  if r.host_player_id is distinct from me.id then perform public.ll_fail('Only the host can end the mission.'); end if;
  if r.status <> 'playing' then return jsonb_build_object('ok', true); end if;
  select * into g from public.games where id = r.current_game_id;
  select * into t from public.turns where id = g.current_turn_id;
  if t.phase in ('briefing', 'clue') then perform public.ll_close_word(t.id, 'unsolved', null, now()); end if;
  perform public.ll_finish_game(g.id, now());
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.ll_end_game(uuid, uuid) from public, anon, authenticated;
grant execute on function public.ll_end_game(uuid, uuid) to service_role;
