-- Tighten function exposure flagged by the Supabase security advisor.
--  * Trigger functions are never meant to be called through the API.
--  * Membership helpers are only needed by signed-in users (RLS policies).
--  * create_team / create_job need a signed-in user; job_report stays open to
--    anon on purpose (workers authenticate with the per-job token).

revoke execute on function public.trg_check_team_refs() from public, anon, authenticated;
revoke execute on function public.trg_events_after() from public, anon, authenticated;
revoke execute on function public.trg_refresh_video_context() from public, anon, authenticated;
revoke execute on function public.trg_line_members_refresh() from public, anon, authenticated;
revoke execute on function public.trg_videos_duration() from public, anon, authenticated;
revoke execute on function public.trg_events_context() from public, anon, authenticated;
revoke execute on function public.trg_clips_before() from public, anon, authenticated;

revoke execute on function public.is_team_member(uuid) from public, anon;
revoke execute on function public.can_edit_team(uuid) from public, anon;
revoke execute on function public.is_team_owner(uuid) from public, anon;
revoke execute on function public.create_team(text) from public, anon;
revoke execute on function public.create_job(uuid, text, jsonb) from public, anon;
grant execute on function public.is_team_member(uuid) to authenticated;
grant execute on function public.can_edit_team(uuid) to authenticated;
grant execute on function public.is_team_owner(uuid) to authenticated;
grant execute on function public.create_team(text) to authenticated;
grant execute on function public.create_job(uuid, text, jsonb) to authenticated;

alter function public.zone_for_x(numeric) set search_path = public;
