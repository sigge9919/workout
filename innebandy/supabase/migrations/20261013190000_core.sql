-- Core schema for the floorball analysis app (phase 1).
--
-- Conventions
--   * Every tenant-owned table carries team_id; RLS is keyed on it.
--   * Times on a video are seconds from the start of that video file (video_t).
--   * Rink coordinates are metres on a 40 x 20 m rink, normalised so that the
--     own team always attacks towards x = 40. Zones derive from x.
--   * Manual and automatic data share the same tables and are told apart by
--     origin / source columns; automatic rows carry run_id + model_version.
--   * Shifts, line changes and game-state changes are stored as change points
--     ("from t on, X is active"); intervals are derived with window functions.
--     This keeps non-linear tagging (scrubbing back and forth) consistent.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- enums

create type public.team_role as enum ('owner', 'coach', 'analyst', 'player');
create type public.side as enum ('own', 'opp');
create type public.event_origin as enum ('manual', 'auto');
create type public.review_status as enum ('pending', 'approved', 'rejected', 'edited');
create type public.video_source as enum ('fixed', 'auto_cam', 'broadcast', 'unknown');
create type public.video_status as enum ('created', 'uploading', 'uploaded', 'processing', 'ready', 'failed');
create type public.job_status as enum ('queued', 'running', 'succeeded', 'failed', 'cancelled');
create type public.clock_anchor_kind as enum ('period_start', 'sync', 'period_end');

-- ---------------------------------------------------------------- tenancy

create table public.teams (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) > 0),
  short_name  text,
  created_by  uuid references auth.users (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);

create table public.team_members (
  team_id    uuid not null references public.teams (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       public.team_role not null default 'coach',
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index team_members_user_idx on public.team_members (user_id);

create table public.team_settings (
  team_id            uuid primary key references public.teams (id) on delete cascade,
  clip_pre_s         numeric(6,2) not null default 5 check (clip_pre_s >= 0 and clip_pre_s <= 120),
  clip_post_s        numeric(6,2) not null default 5 check (clip_post_s >= 0 and clip_post_s <= 120),
  period_length_s    integer not null default 1200 check (period_length_s > 0),
  periods            smallint not null default 3 check (periods between 1 and 5),
  updated_at         timestamptz not null default now()
);

-- Membership helpers. SECURITY DEFINER so policies on team_members itself do
-- not recurse.
create or replace function public.is_team_member(p_team_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.team_members
    where team_id = p_team_id and user_id = auth.uid()
  );
$$;

create or replace function public.can_edit_team(p_team_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.team_members
    where team_id = p_team_id and user_id = auth.uid()
      and role in ('owner', 'coach', 'analyst')
  );
$$;

create or replace function public.is_team_owner(p_team_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.team_members
    where team_id = p_team_id and user_id = auth.uid() and role = 'owner'
  );
$$;

-- ---------------------------------------------------------------- base data

create table public.opponents (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams (id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  short_name  text,
  created_at  timestamptz not null default now(),
  unique (team_id, name)
);

-- opponent_id null => player in the own team.
create table public.players (
  id             uuid primary key default gen_random_uuid(),
  team_id        uuid not null references public.teams (id) on delete cascade,
  opponent_id    uuid references public.opponents (id) on delete cascade,
  name           text not null check (length(trim(name)) > 0),
  jersey_number  smallint check (jersey_number between 0 and 99),
  position       text check (position in ('F', 'C', 'B', 'MV')),
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);
create index players_team_idx on public.players (team_id);
create index players_opponent_idx on public.players (opponent_id);

create table public.seasons (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null references public.teams (id) on delete cascade,
  name       text not null,
  starts_on  date,
  ends_on    date,
  created_at timestamptz not null default now()
);
create index seasons_team_idx on public.seasons (team_id);

create table public.matches (
  id           uuid primary key default gen_random_uuid(),
  team_id      uuid not null references public.teams (id) on delete cascade,
  season_id    uuid references public.seasons (id) on delete set null,
  opponent_id  uuid references public.opponents (id) on delete set null,
  played_at    timestamptz not null default now(),
  is_home      boolean not null default true,
  competition  text,
  venue        text,
  notes        text,
  created_at   timestamptz not null default now()
);
create index matches_team_idx on public.matches (team_id, played_at desc);
create index matches_season_idx on public.matches (season_id);
create index matches_opponent_idx on public.matches (opponent_id);

-- Lines ("femmor") are defined per match. side = which team the line belongs to.
create table public.lines (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null references public.teams (id) on delete cascade,
  match_id   uuid not null references public.matches (id) on delete cascade,
  side       public.side not null default 'own',
  name       text not null,
  hotkey     text check (hotkey is null or length(hotkey) = 1),
  sort       smallint not null default 0,
  created_at timestamptz not null default now()
);
create index lines_match_idx on public.lines (match_id);
create unique index lines_hotkey_uniq on public.lines (match_id, hotkey) where hotkey is not null;

create table public.line_members (
  line_id    uuid not null references public.lines (id) on delete cascade,
  player_id  uuid not null references public.players (id) on delete cascade,
  team_id    uuid not null references public.teams (id) on delete cascade,
  slot       text,
  primary key (line_id, player_id)
);
create index line_members_player_idx on public.line_members (player_id);

-- ---------------------------------------------------------------- video

create table public.videos (
  id               uuid primary key default gen_random_uuid(),
  team_id          uuid not null references public.teams (id) on delete cascade,
  match_id         uuid not null references public.matches (id) on delete cascade,
  title            text,
  part_index       smallint not null default 1,
  source_type      public.video_source not null default 'unknown',
  status           public.video_status not null default 'created',
  storage_backend  text not null default 'local',
  original_key     text,
  original_bytes   bigint,
  proxy_key        text,
  poster_key       text,
  duration_s       numeric(10,3) check (duration_s is null or duration_s > 0),
  fps              numeric(7,3),
  width            integer,
  height           integer,
  error            text,
  created_at       timestamptz not null default now()
);
create index videos_match_idx on public.videos (match_id);

-- Background jobs (transcoding now; analysis pipeline steps from phase 3).
-- Workers authenticate per job with a random token whose hash is stored here,
-- so they never need the service-role key for status reporting.
create table public.jobs (
  id           uuid primary key default gen_random_uuid(),
  team_id      uuid not null references public.teams (id) on delete cascade,
  video_id     uuid references public.videos (id) on delete cascade,
  kind         text not null,
  status       public.job_status not null default 'queued',
  progress     real not null default 0 check (progress between 0 and 1),
  message      text,
  params       jsonb not null default '{}'::jsonb,
  result       jsonb,
  token_hash   text not null,
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now(),
  started_at   timestamptz,
  finished_at  timestamptz
);
create index jobs_video_idx on public.jobs (video_id, created_at desc);
create index jobs_team_idx on public.jobs (team_id, created_at desc);

-- Manual clock anchors: "at video_t the match clock showed clock_s (elapsed
-- seconds in period)". Phase 3 OCR writes the same table with origin = auto.
create table public.clock_anchors (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams (id) on delete cascade,
  video_id    uuid not null references public.videos (id) on delete cascade,
  video_t     numeric(10,3) not null check (video_t >= 0),
  period      smallint not null check (period between 1 and 5),
  clock_s     numeric(8,3) not null check (clock_s >= 0),
  kind        public.clock_anchor_kind not null default 'sync',
  origin      public.event_origin not null default 'manual',
  confidence  real,
  created_at  timestamptz not null default now()
);
create index clock_anchors_video_idx on public.clock_anchors (video_id, video_t);

-- "From video_t, line X is on court for side S". line_id null => no line
-- (stoppage / bench) for that side.
create table public.line_changes (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams (id) on delete cascade,
  video_id    uuid not null references public.videos (id) on delete cascade,
  side        public.side not null default 'own',
  video_t     numeric(10,3) not null check (video_t >= 0),
  line_id     uuid references public.lines (id) on delete cascade,
  origin      public.event_origin not null default 'manual',
  confidence  real,
  review_status public.review_status not null default 'approved',
  created_at  timestamptz not null default now()
);
create index line_changes_video_idx on public.line_changes (video_id, side, video_t);

-- "From video_t, player is the goalkeeper in goal for side S". player_id null
-- => empty net.
create table public.goalie_changes (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams (id) on delete cascade,
  video_id    uuid not null references public.videos (id) on delete cascade,
  side        public.side not null default 'own',
  video_t     numeric(10,3) not null check (video_t >= 0),
  player_id   uuid references public.players (id) on delete cascade,
  origin      public.event_origin not null default 'manual',
  created_at  timestamptz not null default now()
);
create index goalie_changes_video_idx on public.goalie_changes (video_id, side, video_t);

-- "From video_t, the game state is own_skaters vs opp_skaters". Goalies are
-- counted separately so 6 vs 5 with empty net is representable.
create table public.game_state_changes (
  id           uuid primary key default gen_random_uuid(),
  team_id      uuid not null references public.teams (id) on delete cascade,
  video_id     uuid not null references public.videos (id) on delete cascade,
  video_t      numeric(10,3) not null check (video_t >= 0),
  own_skaters  smallint not null check (own_skaters between 0 and 6),
  opp_skaters  smallint not null check (opp_skaters between 0 and 6),
  own_goalie   boolean not null default true,
  opp_goalie   boolean not null default true,
  origin       public.event_origin not null default 'manual',
  confidence   real,
  created_at   timestamptz not null default now()
);
create index game_state_changes_video_idx on public.game_state_changes (video_id, video_t);

-- ---------------------------------------------------------------- tagging

-- Event types cover both manual tag types and (later) automatic event types,
-- e.g. ball-based events from a future detector.
create table public.event_types (
  id                uuid primary key default gen_random_uuid(),
  team_id           uuid not null references public.teams (id) on delete cascade,
  key               text not null check (key ~ '^[a-z0-9_]+$'),
  name              text not null,
  category          text,
  hotkey            text check (hotkey is null or length(hotkey) = 1),
  color             text not null default '#64748b',
  default_side      public.side not null default 'own',
  asks_side         boolean not null default false,
  asks_position     boolean not null default true,
  player_role_label text,
  attribute_schema  jsonb not null default '{"fields": []}'::jsonb,
  clip_pre_s        numeric(6,2) check (clip_pre_s is null or clip_pre_s between 0 and 120),
  clip_post_s       numeric(6,2) check (clip_post_s is null or clip_post_s between 0 and 120),
  is_auto           boolean not null default false,
  is_active         boolean not null default true,
  sort              smallint not null default 0,
  created_at        timestamptz not null default now(),
  unique (team_id, key)
);
create unique index event_types_hotkey_uniq on public.event_types (team_id, lower(hotkey))
  where hotkey is not null and is_active;

create table public.events (
  id              uuid primary key default gen_random_uuid(),
  team_id         uuid not null references public.teams (id) on delete cascade,
  match_id        uuid not null references public.matches (id) on delete cascade,
  video_id        uuid not null references public.videos (id) on delete cascade,
  event_type_id   uuid not null references public.event_types (id) on delete restrict,
  origin          public.event_origin not null default 'manual',
  video_t         numeric(10,3) not null check (video_t >= 0),
  side            public.side not null default 'own',
  -- Context, filled automatically by trigger unless context_locked.
  period          smallint,
  clock_s         numeric(8,3),
  own_skaters     smallint,
  opp_skaters     smallint,
  own_goalie      boolean,
  opp_goalie      boolean,
  context_locked  boolean not null default false,
  -- Position on the normalised rink (own team attacks towards x = 40).
  x_m             numeric(5,2) check (x_m is null or x_m between 0 and 40),
  y_m             numeric(5,2) check (y_m is null or y_m between 0 and 20),
  zone            text check (zone in ('def', 'mid', 'off')),
  attributes      jsonb not null default '{}'::jsonb,
  label           text,
  note            text,
  -- Provenance for automatic events.
  confidence      real check (confidence is null or confidence between 0 and 1),
  run_id          uuid,
  model_version   text,
  review_status   public.review_status not null default 'approved',
  created_by      uuid default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index events_match_idx on public.events (match_id, video_t);
create index events_video_idx on public.events (video_id, video_t);
create index events_type_idx on public.events (event_type_id);
create index events_team_idx on public.events (team_id, created_at desc);

create table public.event_players (
  event_id   uuid not null references public.events (id) on delete cascade,
  player_id  uuid not null references public.players (id) on delete cascade,
  team_id    uuid not null references public.teams (id) on delete cascade,
  role       text not null default 'primary' check (role in ('primary', 'secondary', 'involved', 'goalie')),
  primary key (event_id, player_id, role)
);
create index event_players_player_idx on public.event_players (player_id);

-- Snapshot of who was on court when the event happened (both sides).
create table public.event_on_ice (
  event_id   uuid not null references public.events (id) on delete cascade,
  player_id  uuid not null references public.players (id) on delete cascade,
  team_id    uuid not null references public.teams (id) on delete cascade,
  side       public.side not null,
  is_goalie  boolean not null default false,
  primary key (event_id, player_id)
);
create index event_on_ice_player_idx on public.event_on_ice (player_id);

-- Clips are time ranges on the source video. Files are only produced on export.
create table public.clips (
  id           uuid primary key default gen_random_uuid(),
  team_id      uuid not null references public.teams (id) on delete cascade,
  match_id     uuid not null references public.matches (id) on delete cascade,
  video_id     uuid not null references public.videos (id) on delete cascade,
  event_id     uuid unique references public.events (id) on delete cascade,
  start_s      numeric(10,3) not null check (start_s >= 0),
  end_s        numeric(10,3) not null,
  is_adjusted  boolean not null default false,
  title        text,
  created_at   timestamptz not null default now(),
  check (end_s > start_s)
);
create index clips_video_idx on public.clips (video_id, start_s);
create index clips_match_idx on public.clips (match_id);

-- ---------------------------------------------------------------- consistency

-- Child rows must belong to the same team as their parent. Enforced with a
-- generic trigger so a member of team A cannot attach rows to team B's match.
create or replace function public.assert_same_team(p_table regclass, p_id uuid, p_team uuid)
returns void language plpgsql stable security definer set search_path = public
as $$
declare v_team uuid;
begin
  if p_id is null then return; end if;
  execute format('select team_id from %s where id = $1', p_table) into v_team using p_id;
  if v_team is distinct from p_team then
    raise exception 'cross-team reference to % %', p_table, p_id using errcode = '42501';
  end if;
end $$;

create or replace function public.trg_check_team_refs()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  case tg_table_name
    when 'players' then perform public.assert_same_team('public.opponents', new.opponent_id, new.team_id);
    when 'matches' then
      perform public.assert_same_team('public.opponents', new.opponent_id, new.team_id);
      perform public.assert_same_team('public.seasons', new.season_id, new.team_id);
    when 'lines' then perform public.assert_same_team('public.matches', new.match_id, new.team_id);
    when 'line_members' then
      perform public.assert_same_team('public.lines', new.line_id, new.team_id);
      perform public.assert_same_team('public.players', new.player_id, new.team_id);
    when 'videos' then perform public.assert_same_team('public.matches', new.match_id, new.team_id);
    when 'jobs' then perform public.assert_same_team('public.videos', new.video_id, new.team_id);
    when 'clock_anchors', 'game_state_changes' then
      perform public.assert_same_team('public.videos', new.video_id, new.team_id);
    when 'line_changes' then
      perform public.assert_same_team('public.videos', new.video_id, new.team_id);
      perform public.assert_same_team('public.lines', new.line_id, new.team_id);
    when 'goalie_changes' then
      perform public.assert_same_team('public.videos', new.video_id, new.team_id);
      perform public.assert_same_team('public.players', new.player_id, new.team_id);
    when 'events' then
      perform public.assert_same_team('public.matches', new.match_id, new.team_id);
      perform public.assert_same_team('public.videos', new.video_id, new.team_id);
      perform public.assert_same_team('public.event_types', new.event_type_id, new.team_id);
    when 'event_players', 'event_on_ice' then
      perform public.assert_same_team('public.events', new.event_id, new.team_id);
      perform public.assert_same_team('public.players', new.player_id, new.team_id);
    when 'clips' then
      perform public.assert_same_team('public.videos', new.video_id, new.team_id);
      perform public.assert_same_team('public.events', new.event_id, new.team_id);
    else null;
  end case;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['players','matches','lines','line_members','videos','jobs','clock_anchors',
                           'line_changes','goalie_changes','game_state_changes','events',
                           'event_players','event_on_ice','clips']
  loop
    execute format('create trigger %I before insert or update on public.%I
                    for each row execute function public.trg_check_team_refs()', t || '_team_refs', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- RLS

alter table public.teams enable row level security;
create policy teams_select on public.teams for select using (public.is_team_member(id));
create policy teams_update on public.teams for update using (public.is_team_owner(id)) with check (public.is_team_owner(id));
-- Teams are created through create_team() only.

alter table public.team_members enable row level security;
create policy team_members_select on public.team_members for select using (public.is_team_member(team_id));
create policy team_members_write on public.team_members for all
  using (public.is_team_owner(team_id)) with check (public.is_team_owner(team_id));

alter table public.team_settings enable row level security;
create policy team_settings_select on public.team_settings for select using (public.is_team_member(team_id));
create policy team_settings_update on public.team_settings for update
  using (public.can_edit_team(team_id)) with check (public.can_edit_team(team_id));

-- Generic tenant policies: members read, editors write.
do $$
declare t text;
begin
  foreach t in array array['opponents','players','seasons','matches','lines','line_members','videos',
                           'clock_anchors','line_changes','goalie_changes','game_state_changes',
                           'event_types','events','event_players','event_on_ice','clips']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select using (public.is_team_member(team_id))', t || '_select', t);
    execute format('create policy %I on public.%I for insert with check (public.can_edit_team(team_id))', t || '_insert', t);
    execute format('create policy %I on public.%I for update using (public.can_edit_team(team_id)) with check (public.can_edit_team(team_id))', t || '_update', t);
    execute format('create policy %I on public.%I for delete using (public.can_edit_team(team_id))', t || '_delete', t);
  end loop;
end $$;

-- Jobs: readable by members; created and updated only via RPCs.
alter table public.jobs enable row level security;
create policy jobs_select on public.jobs for select using (public.is_team_member(team_id));
revoke all on public.jobs from anon, authenticated;
grant select (id, team_id, video_id, kind, status, progress, message, params, result, created_by,
              created_at, started_at, finished_at) on public.jobs to authenticated;
