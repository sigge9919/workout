-- Derived context (period, clock, game state, players on court) and
-- automatic clip creation for events.

-- ---------------------------------------------------------------- match time

-- Match time at a video time, from the nearest clock anchor at or before t.
-- The clock is assumed to run from that anchor, but never past the next
-- anchor's reading in the same period (the clock was stopped in between) nor
-- past the period length. A 'period_end' anchor freezes the clock.
create or replace function public.match_time_at(p_video_id uuid, p_t numeric)
returns table (period smallint, clock_s numeric)
language plpgsql stable set search_path = public
as $$
declare
  a public.clock_anchors;
  nxt public.clock_anchors;
  v_len integer;
  v_clock numeric;
begin
  select * into a from public.clock_anchors
   where video_id = p_video_id and video_t <= p_t
   order by video_t desc, created_at desc limit 1;
  if not found then
    return;
  end if;

  select s.period_length_s into v_len
    from public.team_settings s where s.team_id = a.team_id;
  v_len := coalesce(v_len, 1200);

  if a.kind = 'period_end' then
    period := a.period; clock_s := a.clock_s;
    return next; return;
  end if;

  v_clock := a.clock_s + (p_t - a.video_t);

  select * into nxt from public.clock_anchors
   where clock_anchors.video_id = p_video_id and clock_anchors.video_t > p_t and clock_anchors.period = a.period
   order by video_t asc limit 1;
  if found then
    v_clock := least(v_clock, greatest(nxt.clock_s, a.clock_s));
  end if;

  period := a.period;
  clock_s := least(v_clock, v_len);
  return next;
end $$;

-- Game state at a video time. Defaults to 5 vs 5 with both goalies.
create or replace function public.game_state_at(p_video_id uuid, p_t numeric)
returns table (own_skaters smallint, opp_skaters smallint, own_goalie boolean, opp_goalie boolean)
language sql stable set search_path = public
as $$
  select * from (
    select g.own_skaters, g.opp_skaters, g.own_goalie, g.opp_goalie
      from public.game_state_changes g
     where g.video_id = p_video_id and g.video_t <= p_t
     order by g.video_t desc, g.created_at desc limit 1
  ) s
  union all
  select 5::smallint, 5::smallint, true, true
   where not exists (
     select 1 from public.game_state_changes g where g.video_id = p_video_id and g.video_t <= p_t
   )
$$;

-- Players on court at a video time: members of the active line per side plus
-- the active goalie per side.
create or replace function public.on_ice_at(p_video_id uuid, p_t numeric)
returns table (player_id uuid, side public.side, is_goalie boolean)
language sql stable set search_path = public
as $$
  with active_line as (
    select distinct on (lc.side) lc.side, lc.line_id
      from public.line_changes lc
     where lc.video_id = p_video_id and lc.video_t <= p_t
       and lc.review_status in ('approved', 'edited')
     order by lc.side, lc.video_t desc, lc.created_at desc
  ), active_goalie as (
    select distinct on (gc.side) gc.side, gc.player_id
      from public.goalie_changes gc
     where gc.video_id = p_video_id and gc.video_t <= p_t
     order by gc.side, gc.video_t desc, gc.created_at desc
  )
  select lm.player_id, al.side, false
    from active_line al join public.line_members lm on lm.line_id = al.line_id
  union
  select ag.player_id, ag.side, true
    from active_goalie ag where ag.player_id is not null
$$;

create or replace function public.zone_for_x(p_x numeric)
returns text language sql immutable
as $$
  -- Rink is 40 m; thirds are a coaching convention, not rink markings.
  select case when p_x is null then null
              when p_x < 40.0 / 3 then 'def'
              when p_x < 80.0 / 3 then 'mid'
              else 'off' end
$$;

-- ---------------------------------------------------------------- events

create or replace function public.trg_events_context()
returns trigger language plpgsql set search_path = public
as $$
declare mt record; gs record;
begin
  new.updated_at := now();
  if new.x_m is not null then
    new.zone := public.zone_for_x(new.x_m);
  elsif tg_op = 'UPDATE' and old.x_m is not null then
    new.zone := null;
  end if;

  if new.context_locked then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.video_t = old.video_t and new.video_id = old.video_id then
    return new;
  end if;

  select * into mt from public.match_time_at(new.video_id, new.video_t);
  new.period := mt.period;
  new.clock_s := mt.clock_s;

  select * into gs from public.game_state_at(new.video_id, new.video_t);
  new.own_skaters := gs.own_skaters;
  new.opp_skaters := gs.opp_skaters;
  new.own_goalie := gs.own_goalie;
  new.opp_goalie := gs.opp_goalie;
  return new;
end $$;

create or replace trigger events_context before insert or update on public.events
  for each row execute function public.trg_events_context();

-- Rebuild the on-court snapshot of one event.
create or replace function public.refresh_event_on_ice(p_event_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare e public.events;
begin
  select * into e from public.events where id = p_event_id;
  if not found or e.context_locked then return; end if;
  delete from public.event_on_ice where event_id = e.id;
  insert into public.event_on_ice (event_id, player_id, team_id, side, is_goalie)
  select e.id, o.player_id, e.team_id, o.side, bool_or(o.is_goalie)
    from public.on_ice_at(e.video_id, e.video_t) o
   group by o.player_id, o.side;
end $$;

-- Clip window for an event type: per-type preset, else team default.
create or replace function public.clip_window(p_event_type_id uuid)
returns table (pre_s numeric, post_s numeric)
language sql stable set search_path = public
as $$
  select coalesce(et.clip_pre_s, s.clip_pre_s, 5), coalesce(et.clip_post_s, s.clip_post_s, 5)
    from public.event_types et
    left join public.team_settings s on s.team_id = et.team_id
   where et.id = p_event_type_id
$$;

-- Clamp a clip to the video. Unknown duration => only clamp at 0.
create or replace function public.clamp_clip(p_video_id uuid, p_start numeric, p_end numeric)
returns table (start_s numeric, end_s numeric)
language plpgsql stable set search_path = public
as $$
declare v_dur numeric;
begin
  select duration_s into v_dur from public.videos where id = p_video_id;
  start_s := greatest(p_start, 0);
  end_s := case when v_dur is null then p_end else least(p_end, v_dur) end;
  if v_dur is not null then
    start_s := least(start_s, greatest(v_dur - 0.1, 0));
  end if;
  if end_s <= start_s then
    end_s := start_s + 0.1;
  end if;
  return next;
end $$;

create or replace function public.trg_events_after()
returns trigger language plpgsql security definer set search_path = public
as $$
declare w record; c record;
begin
  if tg_op = 'INSERT' or new.video_t <> old.video_t or new.video_id <> old.video_id
     or new.context_locked <> old.context_locked then
    perform public.refresh_event_on_ice(new.id);
  end if;

  if tg_op = 'INSERT' then
    select * into w from public.clip_window(new.event_type_id);
    select * into c from public.clamp_clip(new.video_id, new.video_t - w.pre_s, new.video_t + w.post_s);
    insert into public.clips (team_id, match_id, video_id, event_id, start_s, end_s)
    values (new.team_id, new.match_id, new.video_id, new.id, c.start_s, c.end_s);
  elsif new.video_t <> old.video_t or new.event_type_id <> old.event_type_id then
    -- Move the clip along with the event unless the coach adjusted it.
    select * into w from public.clip_window(new.event_type_id);
    select * into c from public.clamp_clip(new.video_id, new.video_t - w.pre_s, new.video_t + w.post_s);
    update public.clips set start_s = c.start_s, end_s = c.end_s, video_id = new.video_id
     where event_id = new.id and not is_adjusted;
  end if;
  return null;
end $$;

create or replace trigger events_after after insert or update on public.events
  for each row execute function public.trg_events_after();

-- Changing who is on court or the game state re-derives the context of
-- events in that video (except locked ones).
create or replace function public.refresh_video_context(p_video_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare r record;
begin
  update public.events e
     set (period, clock_s) = (
           select mt.period, mt.clock_s from public.match_time_at(e.video_id, e.video_t) mt),
         (own_skaters, opp_skaters, own_goalie, opp_goalie) = (
           select gs.own_skaters, gs.opp_skaters, gs.own_goalie, gs.opp_goalie
             from public.game_state_at(e.video_id, e.video_t) gs)
   where e.video_id = p_video_id and not e.context_locked;
  for r in select id from public.events where video_id = p_video_id and not context_locked loop
    perform public.refresh_event_on_ice(r.id);
  end loop;
end $$;

create or replace function public.trg_refresh_video_context()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.refresh_video_context(old.video_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and (tg_op = 'INSERT' or new.video_id <> old.video_id) then
    perform public.refresh_video_context(new.video_id);
  end if;
  return null;
end $$;

create or replace trigger line_changes_refresh after insert or update or delete on public.line_changes
  for each row execute function public.trg_refresh_video_context();
create or replace trigger goalie_changes_refresh after insert or update or delete on public.goalie_changes
  for each row execute function public.trg_refresh_video_context();
create or replace trigger game_state_changes_refresh after insert or update or delete on public.game_state_changes
  for each row execute function public.trg_refresh_video_context();
create or replace trigger clock_anchors_refresh after insert or update or delete on public.clock_anchors
  for each row execute function public.trg_refresh_video_context();

-- Line membership edits also change who was on court.
create or replace function public.trg_line_members_refresh()
returns trigger language plpgsql security definer set search_path = public
as $$
declare v uuid;
begin
  for v in
    select distinct lc.video_id from public.line_changes lc
     where lc.line_id = coalesce(new.line_id, old.line_id)
  loop
    perform public.refresh_video_context(v);
  end loop;
  return null;
end $$;

create or replace trigger line_members_refresh after insert or update or delete on public.line_members
  for each row execute function public.trg_line_members_refresh();

-- Clips: keep inside the video and flag manual edits.
create or replace function public.trg_clips_before()
returns trigger language plpgsql set search_path = public
as $$
declare c record;
begin
  select * into c from public.clamp_clip(new.video_id, new.start_s, new.end_s);
  new.start_s := c.start_s;
  new.end_s := c.end_s;
  return new;
end $$;

create or replace trigger clips_before before insert or update on public.clips
  for each row execute function public.trg_clips_before();

-- When the video duration becomes known (after transcoding), clamp clips.
create or replace function public.trg_videos_duration()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.duration_s is not null and new.duration_s is distinct from old.duration_s then
    update public.clips set end_s = end_s where video_id = new.id;
  end if;
  return null;
end $$;

create or replace trigger videos_duration after update of duration_s on public.videos
  for each row execute function public.trg_videos_duration();

-- Re-apply current presets to clips that were not adjusted by hand.
create or replace function public.reapply_clip_presets(p_team_id uuid, p_event_type_id uuid default null)
returns integer language plpgsql security invoker set search_path = public
as $$
declare n integer;
begin
  update public.clips c
     set start_s = e.video_t - w.pre_s, end_s = e.video_t + w.post_s
    from public.events e, lateral public.clip_window(e.event_type_id) w
   where c.event_id = e.id and c.team_id = p_team_id and not c.is_adjusted
     and (p_event_type_id is null or e.event_type_id = p_event_type_id);
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------- views

-- Line shifts as intervals, derived from change points.
create or replace view public.v_line_shifts with (security_invoker = true) as
select lc.team_id, lc.video_id, v.match_id, lc.side, lc.line_id, lc.origin,
       lc.video_t as start_t,
       coalesce(lead(lc.video_t) over w, v.duration_s) as end_t
  from public.line_changes lc
  join public.videos v on v.id = lc.video_id
 where lc.review_status in ('approved', 'edited')
window w as (partition by lc.video_id, lc.side order by lc.video_t, lc.created_at);

create or replace view public.v_events as
select e.*, et.key as type_key, et.name as type_name, et.color as type_color,
       c.id as clip_id, c.start_s as clip_start_s, c.end_s as clip_end_s, c.is_adjusted as clip_adjusted,
       case
         when e.own_skaters is null then null
         when e.own_goalie is false then 'en_own'
         when e.opp_goalie is false then 'en_opp'
         when e.own_skaters > e.opp_skaters then 'pp'
         when e.own_skaters < e.opp_skaters then 'bp'
         else e.own_skaters || 'v' || e.opp_skaters
       end as game_state
  from public.events e
  join public.event_types et on et.id = e.event_type_id
  left join public.clips c on c.event_id = e.id;
alter view public.v_events set (security_invoker = true);

-- ---------------------------------------------------------------- RPCs

-- Create a team, make the caller its owner and seed default event types.
create or replace function public.create_team(p_name text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare v_team uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  insert into public.teams (name, created_by) values (p_name, auth.uid()) returning id into v_team;
  insert into public.team_members (team_id, user_id, role) values (v_team, auth.uid(), 'owner');
  insert into public.team_settings (team_id) values (v_team);
  perform public.seed_event_types(v_team);
  return v_team;
end $$;

create or replace function public.seed_event_types(p_team_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  insert into public.event_types
    (team_id, key, name, category, hotkey, color, default_side, asks_side, asks_position,
     player_role_label, attribute_schema, clip_pre_s, clip_post_s, sort)
  values
  (p_team_id, 'shot', 'Skott', 'Skott', 's', '#2563eb', 'own', true, true, 'Skytt',
   '{"fields":[
      {"key":"outcome","label":"Utfall","type":"choice","options":[
        {"value":"goal","label":"Mål"},{"value":"saved","label":"Räddning"},
        {"value":"wide","label":"Utanför"},{"value":"blocked","label":"Blockerat"}]},
      {"key":"shot_type","label":"Skottyp","type":"choice","options":[
        {"value":"slap","label":"Slagskott"},{"value":"wrist","label":"Handledsskott"},
        {"value":"one_timer","label":"Direktskott"},{"value":"drag","label":"Dragskott"},
        {"value":"deflection","label":"Styrning"},{"value":"backhand","label":"Backhand"}]},
      {"key":"situation","label":"Avslutsläge","type":"choice","options":[
        {"value":"breakaway","label":"Friläge"},{"value":"pass","label":"Efter passning"},
        {"value":"rebound","label":"Retur"},{"value":"traffic","label":"I trafik"},
        {"value":"distance","label":"Från distans"}]}]}', 10, 5, 10),
  (p_team_id, 'takeaway', 'Bollvinst', 'Boll', 'v', '#16a34a', 'own', false, true, 'Spelare',
   '{"fields":[
      {"key":"kind","label":"Typ","type":"choice","options":[
        {"value":"interception","label":"Brytning"},{"value":"duel","label":"Närkamp"},
        {"value":"press","label":"Press"},{"value":"loose","label":"Lös boll"}]}]}', null, null, 20),
  (p_team_id, 'turnover', 'Bolltapp', 'Boll', 't', '#dc2626', 'own', false, true, 'Spelare',
   '{"fields":[
      {"key":"forced","label":"Typ","type":"choice","options":[
        {"value":"forced","label":"Forcerat"},{"value":"unforced","label":"Oforcerat"}]}]}', null, null, 30),
  (p_team_id, 'zone_entry', 'Zoninträde', 'Zon', 'z', '#9333ea', 'own', true, true, 'Spelare',
   '{"fields":[
      {"key":"control","label":"Kontroll","type":"choice","options":[
        {"value":"controlled","label":"Kontrollerat"},{"value":"uncontrolled","label":"Okontrollerat"}]},
      {"key":"result","label":"Resultat","type":"choice","options":[
        {"value":"success","label":"Lyckat"},{"value":"fail","label":"Misslyckat"}]}]}', null, null, 40),
  (p_team_id, 'breakout', 'Uppspel', 'Spel', 'u', '#0891b2', 'own', false, true, 'Spelare',
   '{"fields":[
      {"key":"result","label":"Resultat","type":"choice","options":[
        {"value":"success","label":"Lyckat"},{"value":"fail","label":"Misslyckat"}]}]}', null, null, 50),
  (p_team_id, 'counter', 'Kontring', 'Spel', 'k', '#ea580c', 'own', true, false, 'Spelare',
   '{"fields":[]}', 8, 5, 60),
  (p_team_id, 'faceoff', 'Tekning', 'Fast situation', 'f', '#ca8a04', 'own', false, true, 'Spelare',
   '{"fields":[
      {"key":"result","label":"Resultat","type":"choice","options":[
        {"value":"won","label":"Vunnen"},{"value":"lost","label":"Förlorad"}]}]}', 3, 8, 70),
  (p_team_id, 'penalty', 'Utvisning', 'Utvisning', 'x', '#be123c', 'own', true, false, 'Utvisad',
   '{"fields":[
      {"key":"minutes","label":"Minuter","type":"choice","options":[
        {"value":"2","label":"2 min"},{"value":"2+2","label":"2+2 min"},
        {"value":"5","label":"5 min"},{"value":"10","label":"10 min"}]},
      {"key":"reason","label":"Orsak","type":"text"}]}', null, null, 80),
  (p_team_id, 'goalie_action', 'Målvaktsaktion', 'Målvakt', 'm', '#475569', 'own', false, true, 'Målvakt',
   '{"fields":[
      {"key":"kind","label":"Typ","type":"choice","options":[
        {"value":"save","label":"Räddning"},{"value":"throw","label":"Utkast"},
        {"value":"position","label":"Positionering"},{"value":"mistake","label":"Misstag"}]}]}', null, null, 90),
  (p_team_id, 'note', 'Notering', 'Fri', 'n', '#0f766e', 'own', false, false, 'Spelare',
   '{"fields":[],"free_label":true}', null, null, 100)
  on conflict (team_id, key) do nothing;
end $$;

-- Create a job for a video and return a one-time worker token.
create or replace function public.create_job(p_video_id uuid, p_kind text, p_params jsonb default '{}'::jsonb)
returns table (job_id uuid, token text)
language plpgsql security definer set search_path = public, extensions
as $$
declare v_team uuid; v_token text;
begin
  select team_id into v_team from public.videos where id = p_video_id;
  if v_team is null or not public.can_edit_team(v_team) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_token := encode(gen_random_bytes(32), 'hex');
  insert into public.jobs (team_id, video_id, kind, params)
  values (v_team, p_video_id, p_kind, coalesce(p_params, '{}'::jsonb))
  returning id into job_id;
  insert into public.job_secrets (job_id, token_hash)
  values (job_id, encode(digest(v_token, 'sha256'), 'hex'));
  token := v_token;
  return next;
end $$;

-- Worker status report, authenticated by the job token. On success of a
-- 'transcode' job the video metadata in p_result is applied.
create or replace function public.job_report(
  p_job_id uuid, p_token text, p_status public.job_status,
  p_progress real default null, p_message text default null, p_result jsonb default null)
returns void language plpgsql security definer set search_path = public, extensions
as $$
declare j public.jobs; v_hash text;
begin
  select * into j from public.jobs where id = p_job_id for update;
  select token_hash into v_hash from public.job_secrets where job_id = p_job_id;
  if not found or v_hash is distinct from encode(digest(p_token, 'sha256'), 'hex') then
    raise exception 'invalid job token' using errcode = '42501';
  end if;
  if j.status in ('succeeded', 'failed', 'cancelled') then
    raise exception 'job already finished' using errcode = '55000';
  end if;

  update public.jobs set
    status = p_status,
    progress = coalesce(p_progress, case when p_status = 'succeeded' then 1 else progress end),
    message = coalesce(p_message, message),
    result = coalesce(p_result, result),
    started_at = coalesce(started_at, case when p_status = 'running' then now() end),
    finished_at = case when p_status in ('succeeded', 'failed', 'cancelled') then now() end
  where id = j.id;

  if j.kind = 'transcode' and j.video_id is not null then
    if p_status = 'running' then
      update public.videos set status = 'processing', error = null where id = j.video_id;
    elsif p_status = 'succeeded' then
      update public.videos set
        status = 'ready',
        proxy_key = p_result ->> 'proxy_key',
        poster_key = p_result ->> 'poster_key',
        duration_s = (p_result ->> 'duration_s')::numeric,
        fps = (p_result ->> 'fps')::numeric,
        width = (p_result ->> 'width')::integer,
        height = (p_result ->> 'height')::integer
      where id = j.video_id;
    elsif p_status = 'failed' then
      update public.videos set status = 'failed', error = p_message where id = j.video_id;
    end if;
  end if;
end $$;

revoke execute on function public.job_report(uuid, text, public.job_status, real, text, jsonb) from public;
grant execute on function public.job_report(uuid, text, public.job_status, real, text, jsonb) to anon, authenticated;
revoke execute on function public.seed_event_types(uuid) from public, anon, authenticated;
revoke execute on function public.refresh_event_on_ice(uuid) from public, anon, authenticated;
revoke execute on function public.refresh_video_context(uuid) from public, anon, authenticated;
revoke execute on function public.assert_same_team(regclass, uuid, uuid) from public, anon, authenticated;

-- Realtime for job status in the UI.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.jobs, public.videos;
  end if;
end $$;
