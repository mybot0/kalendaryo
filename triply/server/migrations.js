/*
 * migrations.js — the database layout, as ordered steps. Each step runs once and is recorded.
 * Never edit a step that has shipped; add a new one at the end.
 * Dates are text YYYY-MM-DD and times are text HH:MM (trip-local wall clock), so no time-zone surprises.
 */
'use strict';

const DATE = "'^\\d{4}-\\d{2}-\\d{2}$'";
const TIME = "'^\\d{2}:\\d{2}$'";

module.exports = [
  {
    id: '001_core',
    sql: `
      create table trips (
        id uuid primary key default gen_random_uuid(),
        name text not null,
        destination text not null default '',
        route text[] not null default '{}',
        start_date text not null check (start_date ~ ${DATE}),
        end_date text not null check (end_date ~ ${DATE}),
        description text not null default '',
        cover_emoji text not null default '✈️',
        cover_color text not null default '#F4A59A',
        cover_blob uuid,
        viewers_chat boolean not null default true,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        check (end_date >= start_date)
      );

      create table members (
        id uuid primary key default gen_random_uuid(),
        trip_id uuid not null references trips(id) on delete cascade,
        name text not null,
        avatar text not null default '',
        color text not null,
        role text not null check (role in ('owner','editor','viewer')),
        token_hash text not null unique,
        joined_at timestamptz not null default now(),
        last_seen_at timestamptz
      );
      create index members_trip on members(trip_id);

      create table invites (
        id uuid primary key default gen_random_uuid(),
        trip_id uuid not null references trips(id) on delete cascade,
        code_hash text not null unique,
        role text not null check (role in ('owner','editor','viewer')),
        label text not null default '',
        created_by uuid references members(id) on delete set null,
        created_at timestamptz not null default now(),
        expires_at timestamptz not null,
        used_at timestamptz,
        used_by uuid references members(id) on delete set null
      );
      create index invites_trip on invites(trip_id);

      create table items (
        id uuid primary key default gen_random_uuid(),
        trip_id uuid not null references trips(id) on delete cascade,
        type text not null check (type in ('flight','hotel','car','cruise','activity','restaurant','place','note')),
        title text not null,
        start_date text check (start_date is null or start_date ~ ${DATE}),
        start_time text check (start_time is null or start_time ~ ${TIME}),
        end_date text check (end_date is null or end_date ~ ${DATE}),
        end_time text check (end_time is null or end_time ~ ${TIME}),
        location text not null default '',
        confirmation text not null default '',
        notes text not null default '',
        data jsonb not null default '{}',
        version int not null default 1,
        created_by uuid references members(id) on delete set null,
        updated_by uuid references members(id) on delete set null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
      create index items_trip on items(trip_id, start_date, start_time);

      create table blobs (
        id uuid primary key default gen_random_uuid(),
        trip_id uuid not null references trips(id) on delete cascade,
        mime text not null,
        name text not null default '',
        size int not null,
        bytes bytea not null,
        created_by uuid references members(id) on delete set null,
        created_at timestamptz not null default now()
      );
      create index blobs_trip on blobs(trip_id);

      create table messages (
        id bigserial primary key,
        trip_id uuid not null references trips(id) on delete cascade,
        sender_id uuid references members(id) on delete set null,
        to_member uuid references members(id) on delete cascade,
        kind text not null default 'text' check (kind in ('text','activity')),
        body text not null default '',
        mentions uuid[] not null default '{}',
        blob_id uuid,
        item_id uuid,
        meta jsonb not null default '{}',
        created_at timestamptz not null default now()
      );
      create index messages_trip on messages(trip_id, id);
      create index messages_dm on messages(trip_id, to_member, sender_id, id);

      create table chat_reads (
        member_id uuid not null references members(id) on delete cascade,
        thread text not null,
        last_id bigint not null default 0,
        primary key (member_id, thread)
      );
    `
  },
  {
    id: '002_expenses',
    sql: `
      create table expenses (
        id uuid primary key default gen_random_uuid(),
        trip_id uuid not null references trips(id) on delete cascade,
        title text not null,
        amount_cents bigint not null check (amount_cents > 0),
        currency text not null,
        paid_by uuid references members(id) on delete set null,
        split uuid[] not null,
        spent_on text check (spent_on is null or spent_on ~ ${DATE}),
        item_id uuid references items(id) on delete set null,
        note text not null default '',
        created_by uuid references members(id) on delete set null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
      create index expenses_trip on expenses(trip_id, created_at);
    `
  },
  {
    id: '003_packing',
    sql: `
      create table packing_items (
        id uuid primary key default gen_random_uuid(),
        trip_id uuid not null references trips(id) on delete cascade,
        title text not null,
        category text not null default '',
        assigned_to uuid references members(id) on delete set null,
        done boolean not null default false,
        done_by uuid references members(id) on delete set null,
        created_by uuid references members(id) on delete set null,
        created_at timestamptz not null default now()
      );
      create index packing_trip on packing_items(trip_id, created_at);
    `
  },
  {
    id: '004_budget',
    sql: `
      alter table trips add column budget numeric(12,2);
      alter table trips add column budget_currency text not null default '';
    `
  },
  {
    id: '005_ai_usage',
    sql: `
      create table ai_usage (
        id bigserial primary key,
        day date not null,
        trip_id uuid references trips(id) on delete set null,
        member_id uuid references members(id) on delete set null,
        kind text not null,
        micro_usd bigint not null default 0,
        created_at timestamptz not null default now()
      );
      create index ai_usage_day on ai_usage(day);
      create index ai_usage_trip on ai_usage(trip_id, day);
    `
  },
  {
    id: '006_ai_requests',
    sql: `
      create table ai_grants (
        member_id uuid primary key references members(id) on delete cascade,
        extra int not null default 0
      );
      create table ai_requests (
        id uuid primary key default gen_random_uuid(),
        trip_id uuid references trips(id) on delete cascade,
        member_id uuid references members(id) on delete cascade,
        name text not null default '',
        message text not null default '',
        status text not null default 'open',
        granted int not null default 0,
        created_at timestamptz not null default now(),
        done_at timestamptz
      );
      create index ai_requests_open on ai_requests(status, created_at);
    `
  }
];
