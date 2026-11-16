-- Audio-only metadata. Song titles, lyrics, users and repertoire stay in Firebase.
create table if not exists public.rehearsal_audio (
  song_id text primary key check (song_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  manifest jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.rehearsal_audio enable row level security;
revoke all on public.rehearsal_audio from anon, authenticated;
grant select, insert, update, delete on public.rehearsal_audio to service_role;

-- A private bucket: no public read policy or anonymous listing.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('ensayo-audio','ensayo-audio',false,12582912,array['audio/mp4'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;
-- Even an unrelated permissive policy must not expose this bucket.
drop policy if exists rehearsal_private_only on storage.objects;
create policy rehearsal_private_only on storage.objects as restrictive for all
to anon,authenticated using (bucket_id <> 'ensayo-audio')
with check (bucket_id <> 'ensayo-audio');

-- Commit metadata after all files exist. Serialize the seven-song pilot limit.
create or replace function public.publish_rehearsal_audio(p_song_id text,p_manifest jsonb)
returns void language plpgsql security invoker set search_path = public as $$
begin
  perform pg_advisory_xact_lock(9180716);
  if not exists(select 1 from public.rehearsal_audio where song_id=p_song_id)
     and (select count(*) from public.rehearsal_audio)>=7 then
    raise exception 'Pilot limited to seven songs';
  end if;
  if jsonb_typeof(p_manifest->'stems') is distinct from 'object'
     or p_manifest->>'recipe' is distinct from 'aac-96k-44100-v1' then
    raise exception 'Invalid audio manifest';
  end if;
  insert into public.rehearsal_audio(song_id,manifest) values(p_song_id,p_manifest)
  on conflict(song_id) do update set manifest=excluded.manifest,updated_at=now();
end;
$$;
revoke all on function public.publish_rehearsal_audio(text,jsonb) from public,anon,authenticated;
grant execute on function public.publish_rehearsal_audio(text,jsonb) to service_role;
