-- Mantra schema — paste into the Supabase SQL editor of a fresh project.
-- Mirrors src/contracts/types.ts exactly; change them together, same commit.

create extension if not exists "pgcrypto";

create table projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  game_url text not null,
  market_context text,
  created_at timestamptz not null default now()
);

create table runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  status text not null default 'created'
    check (status in ('created','playtesting','awaiting_approval','generating_variants',
                      'generating_creatives','deploying','measuring','deciding','done','failed')),
  failed_step text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references runs (id) on delete cascade,
  node text not null
    check (node in ('orchestrator','playtest','variants','creatives','ads','decide')),
  type text not null
    check (type in ('status','action','observation','screenshot','error')),
  message text not null,
  screenshot_url text,
  data jsonb,
  created_at timestamptz not null default now()
);
create index events_run_id_created_at on events (run_id, created_at);

create table playtest_reports (
  run_id uuid primary key references runs (id) on delete cascade,
  playable boolean not null,
  fun_score numeric not null,
  fun_rationale text not null,
  friction_points jsonb not null default '[]',
  bugs jsonb not null default '[]',
  session_summary text not null,
  headline text not null,
  created_at timestamptz not null default now()
);

create table variants (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references runs (id) on delete cascade,
  name text not null,
  hypothesis text not null,
  game_html text not null,
  created_at timestamptz not null default now()
);

create table creatives (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references runs (id) on delete cascade,
  variant_id uuid references variants (id) on delete set null,
  video_url text not null,
  duration_s numeric not null check (duration_s > 0),
  attributes jsonb not null,
  status text not null default 'generated'
    check (status in ('generated','deployed','kept','iterate','killed')),
  created_at timestamptz not null default now()
);

create table metrics (
  id uuid primary key default gen_random_uuid(),
  creative_id uuid not null references creatives (id) on delete cascade,
  ts timestamptz not null,
  impressions integer not null,
  clicks integer not null,
  installs integer not null,
  spend_usd numeric not null check (spend_usd >= 0),
  ctr numeric not null,
  cpi numeric not null,
  watch_time_s numeric not null,
  completion_rate numeric not null check (completion_rate between 0 and 1)
);
create index metrics_creative_id_ts on metrics (creative_id, ts);

create table decisions (
  run_id uuid primary key references runs (id) on delete cascade,
  keep_creative_ids jsonb not null default '[]',
  iterate_creative_ids jsonb not null default '[]',
  kill_creative_ids jsonb not null default '[]',
  evaluations jsonb not null default '[]',
  prototype_recommendation jsonb not null,
  next_build_recommendation text not null,
  rationale text not null,
  created_at timestamptz not null default now()
);

-- Agent knowledge base — compounds context across projects (null project_id = global).
create table memory (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects (id) on delete cascade,
  kind text not null,
  content text not null,
  created_at timestamptz not null default now()
);

-- Security model (hackathon-grade but fail-closed): the browser's anon key can
-- only SELECT (dashboard + realtime). ALL writes go through API routes/worker
-- using the service-role key, which bypasses RLS.
alter table projects enable row level security;
alter table runs enable row level security;
alter table events enable row level security;
alter table playtest_reports enable row level security;
alter table variants enable row level security;
alter table creatives enable row level security;
alter table metrics enable row level security;
alter table decisions enable row level security;
alter table memory enable row level security;

create policy anon_read_projects on projects for select using (true);
create policy anon_read_runs on runs for select using (true);
create policy anon_read_events on events for select using (true);
create policy anon_read_playtest_reports on playtest_reports for select using (true);
create policy anon_read_variants on variants for select using (true);
create policy anon_read_creatives on creatives for select using (true);
create policy anon_read_metrics on metrics for select using (true);
create policy anon_read_decisions on decisions for select using (true);
create policy anon_read_memory on memory for select using (true);

-- Realtime feed for the live dashboard.
alter publication supabase_realtime add table runs;
alter publication supabase_realtime add table events;

-- Public playtest screenshots for the live dashboard. Writes stay server-side
-- through the service role; events carry public URLs, never image bytes.
insert into storage.buckets (id, name, public)
values ('playtest-media', 'playtest-media', true)
on conflict (id) do nothing;

-- Public uploaded HTML prototypes. Writes stay server-side through the service
-- role; projects store public URLs so the local worker can open them.
insert into storage.buckets (id, name, public)
values ('game-uploads', 'game-uploads', true)
on conflict (id) do nothing;
