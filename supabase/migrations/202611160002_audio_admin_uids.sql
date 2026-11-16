-- Administrative audio permissions use stable Firebase UIDs, not email ownership.
-- Only the trusted project owner/management connection can enroll administrators.
create table public.rehearsal_admins (
  firebase_uid text primary key check (length(firebase_uid) between 1 and 128),
  label text not null default '',
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.rehearsal_admins enable row level security;
revoke all on public.rehearsal_admins from public,anon,authenticated;
grant select,insert,update,delete on public.rehearsal_admins to service_role;
