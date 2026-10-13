-- Storage retention: keep original uploads only for the N most recent
-- matches (proxies are always kept), and clean up files of deleted videos.
-- The worker does the actual deletes in object storage after a transcode,
-- authenticated with its job token like job_report.

alter table public.team_settings
  add column keep_originals integer default 5 check (keep_originals is null or keep_originals between 0 and 1000);
comment on column public.team_settings.keep_originals is
  'Keep original video files for this many most recent matches; null = keep all, 0 = delete after transcoding.';

alter table public.videos add column original_deleted_at timestamptz;

-- Object-storage folders to delete (filled when videos are deleted).
create table public.storage_garbage (
  id          bigserial primary key,
  team_id     uuid not null,
  key_prefix  text not null,
  created_at  timestamptz not null default now()
);
create index storage_garbage_team_idx on public.storage_garbage (team_id);
alter table public.storage_garbage enable row level security;
revoke all on public.storage_garbage from anon, authenticated;

create or replace function public.video_storage_prefix(p_team_id uuid, p_video_id uuid)
returns text language sql immutable
as $$ select 'teams/' || p_team_id || '/videos/' || p_video_id || '/' $$;

create or replace function public.trg_videos_garbage()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if old.original_key is not null or old.proxy_key is not null or old.status <> 'created' then
    insert into public.storage_garbage (team_id, key_prefix)
    values (old.team_id, public.video_storage_prefix(old.team_id, old.id));
  end if;
  return old;
end $$;

create or replace trigger videos_garbage after delete on public.videos
  for each row execute function public.trg_videos_garbage();

-- Authenticate a worker by job token. Cleanup may run right after the job
-- reported success, so finished jobs are accepted for one hour.
create or replace function public.job_auth(p_job_id uuid, p_token text)
returns public.jobs language plpgsql stable security definer set search_path = public, extensions
as $$
declare j public.jobs; v_hash text;
begin
  select * into j from public.jobs where id = p_job_id;
  select token_hash into v_hash from public.job_secrets where job_id = p_job_id;
  if j.id is null or v_hash is distinct from encode(digest(p_token, 'sha256'), 'hex') then
    raise exception 'invalid job token' using errcode = '42501';
  end if;
  if j.finished_at is not null and j.finished_at < now() - interval '1 hour' then
    raise exception 'job token expired' using errcode = '42501';
  end if;
  return j;
end $$;

-- What the worker should delete for the job's team.
create or replace function public.job_storage_cleanup(p_job_id uuid, p_token text)
returns table (kind text, video_id uuid, key text)
language plpgsql security definer set search_path = public
as $$
declare j public.jobs; v_keep integer;
begin
  j := public.job_auth(p_job_id, p_token);
  select s.keep_originals into v_keep from public.team_settings s where s.team_id = j.team_id;

  if v_keep is not null then
    return query
    with recent as (
      select m.id from public.matches m
       where m.team_id = j.team_id
         and exists (select 1 from public.videos x where x.match_id = m.id and x.status = 'ready')
       order by m.played_at desc, m.created_at desc
       limit v_keep
    )
    select 'original'::text, v.id, v.original_key
      from public.videos v
     where v.team_id = j.team_id and v.status = 'ready' and v.original_key is not null
       and v.proxy_key is not null
       and v.match_id not in (select id from recent);
  end if;

  return query
  select 'prefix'::text, null::uuid, g.key_prefix
    from public.storage_garbage g where g.team_id = j.team_id;
end $$;

-- Record what the worker deleted.
create or replace function public.job_storage_cleanup_done(
  p_job_id uuid, p_token text, p_video_ids uuid[], p_prefixes text[])
returns void language plpgsql security definer set search_path = public
as $$
declare j public.jobs;
begin
  j := public.job_auth(p_job_id, p_token);
  update public.videos set original_key = null, original_deleted_at = now()
   where team_id = j.team_id and id = any(coalesce(p_video_ids, '{}'));
  delete from public.storage_garbage
   where team_id = j.team_id and key_prefix = any(coalesce(p_prefixes, '{}'));
end $$;

revoke execute on function public.job_auth(uuid, text) from public, anon, authenticated;
revoke execute on function public.trg_videos_garbage() from public, anon, authenticated;
revoke execute on function public.job_storage_cleanup(uuid, text) from public;
revoke execute on function public.job_storage_cleanup_done(uuid, text, uuid[], text[]) from public;
grant execute on function public.job_storage_cleanup(uuid, text) to anon, authenticated;
grant execute on function public.job_storage_cleanup_done(uuid, text, uuid[], text[]) to anon, authenticated;
