-- Aegis enforcement store.
--
-- Everything lives in its own `aegis` schema. The application connects as the
-- dedicated `aegis_app` login role, which can only touch this schema, cannot
-- bypass row-level security, and cannot update or delete decision-log rows.
-- The role's password is set out-of-band and never committed.
--
-- Owner isolation is enforced twice: by the application (every query is
-- scoped to the authenticated owner) and by RLS (every request runs in a
-- transaction with `aegis.owner_id` set, and policies only expose that
-- owner's rows).

create schema if not exists aegis;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'aegis_app') then
    create role aegis_app login noinherit;
  end if;
end
$$;

revoke all on schema aegis from public;
grant usage on schema aegis to aegis_app;

-- The owner the current transaction is acting for (NULL when unset).
create or replace function aegis.current_owner() returns uuid
language sql stable
as $$ select nullif(current_setting('aegis.owner_id', true), '')::uuid $$;

-- ---------------------------------------------------------------- owners
create table if not exists aegis.owners (
  id              uuid primary key default gen_random_uuid(),
  label           text not null check (char_length(label) between 1 and 80),
  key_hash        text not null unique check (char_length(key_hash) = 64),
  key_prefix      text not null,
  created_ip_hash text,
  created_at      timestamptz not null default now()
);
create index if not exists owners_created_ip_idx on aegis.owners (created_ip_hash, created_at);

-- ---------------------------------------------------------------- agents
create table if not exists aegis.agents (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references aegis.owners (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 80),
  key_hash   text not null unique check (char_length(key_hash) = 64),
  key_prefix text not null,
  status     text not null default 'active' check (status in ('active', 'revoked')),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by text
);
create index if not exists agents_owner_idx on aegis.agents (owner_id, created_at desc);

-- ---------------------------------------------------------------- policies
create table if not exists aegis.policies (
  agent_id                uuid primary key references aegis.agents (id) on delete cascade,
  owner_id                uuid not null references aegis.owners (id) on delete cascade,
  per_action_cap_cents    bigint not null check (per_action_cap_cents >= 0),
  window_cap_cents        bigint not null check (window_cap_cents >= 0),
  window_seconds          integer not null check (window_seconds between 60 and 2592000),
  approval_threshold_cents bigint check (approval_threshold_cents >= 0),
  always_require_approval boolean not null default false,
  allowed_scopes          text[] not null default '{}',
  updated_at              timestamptz not null default now()
);
create index if not exists policies_owner_idx on aegis.policies (owner_id);

-- ---------------------------------------------------------------- pending actions (approval queue)
create table if not exists aegis.pending_actions (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null references aegis.owners (id) on delete cascade,
  agent_id           uuid not null references aegis.agents (id) on delete cascade,
  action             text not null,
  request            jsonb not null,
  payload_hash       text not null check (char_length(payload_hash) = 64),
  amount_cents       bigint not null default 0,
  scopes             text[] not null default '{}',
  status             text not null default 'pending'
                     check (status in ('pending', 'approved', 'denied', 'expired', 'consumed', 'cancelled')),
  reason             text,
  created_at         timestamptz not null default now(),
  expires_at         timestamptz not null,
  decided_at         timestamptz,
  decided_by         text,
  release_expires_at timestamptz,
  token_hash         text unique,
  token_issued_at    timestamptz,
  consumed_at        timestamptz
);
create index if not exists pending_actions_owner_status_idx on aegis.pending_actions (owner_id, status, created_at desc);
create index if not exists pending_actions_agent_status_idx on aegis.pending_actions (agent_id, status);

-- ---------------------------------------------------------------- decision log (append-only)
create table if not exists aegis.decision_log (
  id                 bigint generated always as identity primary key,
  owner_id           uuid not null references aegis.owners (id),
  agent_id           uuid references aegis.agents (id),
  pending_action_id  uuid references aegis.pending_actions (id),
  event_type         text not null check (event_type in
                       ('enforce', 'release', 'approve', 'deny', 'expire', 'revoke', 'policy_set', 'agent_created')),
  decision           text check (decision in ('ALLOWED', 'BLOCKED', 'REQUIRES_APPROVAL')),
  reason             text not null,
  actor_type         text not null check (actor_type in ('owner', 'agent', 'system')),
  actor_id           text not null,
  action             text,
  amount_cents       bigint,
  payload_hash       text,
  counts_toward_spend boolean not null default false,
  created_at         timestamptz not null default clock_timestamp()
);
create index if not exists decision_log_owner_time_idx on aegis.decision_log (owner_id, created_at desc);
create index if not exists decision_log_agent_spend_idx on aegis.decision_log (agent_id, created_at) where counts_toward_spend;
create index if not exists decision_log_pending_idx on aegis.decision_log (pending_action_id);

create or replace function aegis.forbid_mutation() returns trigger
language plpgsql
as $$
begin
  raise exception 'aegis.decision_log is append-only (% blocked)', tg_op;
end
$$;

drop trigger if exists decision_log_no_update_delete on aegis.decision_log;
create trigger decision_log_no_update_delete
  before update or delete on aegis.decision_log
  for each row execute function aegis.forbid_mutation();

drop trigger if exists decision_log_no_truncate on aegis.decision_log;
create trigger decision_log_no_truncate
  before truncate on aegis.decision_log
  for each statement execute function aegis.forbid_mutation();

-- ---------------------------------------------------------------- row-level security
alter table aegis.owners          enable row level security;
alter table aegis.agents          enable row level security;
alter table aegis.policies        enable row level security;
alter table aegis.pending_actions enable row level security;
alter table aegis.decision_log    enable row level security;

drop policy if exists owners_self on aegis.owners;
create policy owners_self on aegis.owners for select to aegis_app
  using (id = aegis.current_owner());

drop policy if exists agents_owner on aegis.agents;
create policy agents_owner on aegis.agents for all to aegis_app
  using (owner_id = aegis.current_owner()) with check (owner_id = aegis.current_owner());

drop policy if exists policies_owner on aegis.policies;
create policy policies_owner on aegis.policies for all to aegis_app
  using (owner_id = aegis.current_owner()) with check (owner_id = aegis.current_owner());

drop policy if exists pending_owner on aegis.pending_actions;
create policy pending_owner on aegis.pending_actions for all to aegis_app
  using (owner_id = aegis.current_owner()) with check (owner_id = aegis.current_owner());

drop policy if exists decision_log_read on aegis.decision_log;
create policy decision_log_read on aegis.decision_log for select to aegis_app
  using (owner_id = aegis.current_owner());

drop policy if exists decision_log_append on aegis.decision_log;
create policy decision_log_append on aegis.decision_log for insert to aegis_app
  with check (owner_id = aegis.current_owner());

-- ---------------------------------------------------------------- pre-auth lookups (security definer)
-- Credentials are looked up by SHA-256 hash before an owner context exists.
-- These functions return only the ids needed to establish that context.

create or replace function aegis.resolve_owner(p_key_hash text) returns uuid
language sql stable security definer
set search_path = aegis, pg_temp
as $$ select id from aegis.owners where key_hash = p_key_hash $$;

create or replace function aegis.resolve_agent(p_key_hash text)
returns table (agent_id uuid, owner_id uuid, status text)
language sql stable security definer
set search_path = aegis, pg_temp
as $$ select id, owner_id, status from aegis.agents where key_hash = p_key_hash $$;

create or replace function aegis.create_owner(
  p_label text, p_key_hash text, p_key_prefix text, p_ip_hash text, p_max_per_hour integer
) returns uuid
language plpgsql volatile security definer
set search_path = aegis, pg_temp
as $$
declare
  recent integer;
  new_id uuid;
begin
  if p_ip_hash is not null then
    perform pg_advisory_xact_lock(hashtextextended('aegis-owner-signup:' || p_ip_hash, 0));
    select count(*) into recent from aegis.owners
      where created_ip_hash = p_ip_hash and created_at > now() - interval '1 hour';
    if recent >= p_max_per_hour then
      raise exception 'aegis_rate_limited' using errcode = 'P0001';
    end if;
  end if;
  insert into aegis.owners (label, key_hash, key_prefix, created_ip_hash)
    values (p_label, p_key_hash, p_key_prefix, p_ip_hash)
    returning id into new_id;
  return new_id;
end
$$;

revoke all on function aegis.resolve_owner(text) from public;
revoke all on function aegis.resolve_agent(text) from public;
revoke all on function aegis.create_owner(text, text, text, text, integer) from public;
grant execute on function aegis.resolve_owner(text) to aegis_app;
grant execute on function aegis.resolve_agent(text) to aegis_app;
grant execute on function aegis.create_owner(text, text, text, text, integer) to aegis_app;
grant execute on function aegis.current_owner() to aegis_app;

-- ---------------------------------------------------------------- table privileges
revoke all on all tables in schema aegis from public;
grant select                 on aegis.owners          to aegis_app;
grant select, insert, update on aegis.agents          to aegis_app;
grant select, insert, update on aegis.policies        to aegis_app;
grant select, insert, update on aegis.pending_actions to aegis_app;
grant select, insert         on aegis.decision_log    to aegis_app;

-- The Supabase API roles get nothing here: the schema is not exposed through
-- PostgREST and these roles have no usage, table or function privileges.
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on schema aegis from %I', r);
      execute format('revoke all on all tables in schema aegis from %I', r);
      execute format('revoke all on all functions in schema aegis from %I', r);
    end if;
  end loop;
end
$$;
