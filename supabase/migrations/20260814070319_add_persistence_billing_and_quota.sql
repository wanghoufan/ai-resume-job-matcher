-- Durable persistence, billing primitives, and quota enforcement for AI-resume-helper.

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  monthly_price_cents integer not null default 0 check (monthly_price_cents >= 0),
  currency text not null default 'CNY' check (char_length(currency) = 3),
  analysis_limit integer not null check (analysis_limit >= 0),
  token_limit bigint not null default 0 check (token_limit >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.plans (code, name, description, monthly_price_cents, analysis_limit, token_limit)
values ('free', '免费版', '用于产品体验与早期测试的默认套餐。', 0, 5, 500000)
on conflict (code) do nothing;

create table if not exists public.usage_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  plan_code text not null references public.plans(code),
  period_start timestamptz not null,
  period_end timestamptz not null,
  analysis_limit integer not null check (analysis_limit >= 0),
  analysis_used integer not null default 0 check (analysis_used >= 0),
  token_limit bigint not null default 0 check (token_limit >= 0),
  tokens_used bigint not null default 0 check (tokens_used >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, period_start),
  check (period_end > period_start)
);

create table if not exists public.billing_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  user_id uuid references auth.users(id) on delete set null,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  event_type text not null,
  status text not null,
  amount_cents integer,
  currency text check (currency is null or char_length(currency) = 3),
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

alter table public.analyses
  add column if not exists provider text not null default 'deepseek',
  add column if not exists result_schema_version text not null default 'v1',
  add column if not exists provider_request_id text,
  add column if not exists latency_ms integer check (latency_ms is null or latency_ms >= 0);

alter table public.resumes
  add column if not exists content_hash text;

alter table public.job_descriptions
  add column if not exists content_hash text;

create index if not exists analyses_resume_id_idx on public.analyses(resume_id);
create index if not exists analyses_job_description_id_idx on public.analyses(job_description_id);
create index if not exists usage_periods_user_period_idx on public.usage_periods(user_id, period_start desc);
create index if not exists billing_events_user_occurred_idx on public.billing_events(user_id, occurred_at desc);
create index if not exists billing_events_subscription_occurred_idx on public.billing_events(subscription_id, occurred_at desc);

alter table public.plans enable row level security;
alter table public.usage_periods enable row level security;
alter table public.billing_events enable row level security;

drop policy if exists "plans are readable by authenticated users" on public.plans;
create policy "plans are readable by authenticated users"
on public.plans for select to authenticated
using (is_active);

drop policy if exists "users can read own usage periods" on public.usage_periods;
create policy "users can read own usage periods"
on public.usage_periods for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "users can insert own usage periods" on public.usage_periods;
create policy "users can insert own usage periods"
on public.usage_periods for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "users can update own usage periods" on public.usage_periods;
create policy "users can update own usage periods"
on public.usage_periods for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "users can insert own analyses" on public.analyses;
create policy "users can insert own analyses"
on public.analyses for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "users can update own analyses" on public.analyses;
create policy "users can update own analyses"
on public.analyses for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "users can insert own usage events" on public.usage_events;
create policy "users can insert own usage events"
on public.usage_events for insert to authenticated
with check ((select auth.uid()) = user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists plans_set_updated_at on public.plans;
create trigger plans_set_updated_at
before update on public.plans
for each row execute function public.set_updated_at();

drop trigger if exists usage_periods_set_updated_at on public.usage_periods;
create trigger usage_periods_set_updated_at
before update on public.usage_periods
for each row execute function public.set_updated_at();

create or replace function public.reserve_analysis_quota()
returns table (allowed boolean, usage_period_id uuid, remaining integer)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_subscription public.subscriptions%rowtype;
  v_plan public.plans%rowtype;
  v_period public.usage_periods%rowtype;
  v_period_start timestamptz := date_trunc('month', now());
  v_period_end timestamptz := date_trunc('month', now()) + interval '1 month';
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select * into v_subscription
  from public.subscriptions
  where user_id = v_user_id and status in ('active', 'trialing')
  limit 1;

  if not found then
    raise exception 'No active subscription found';
  end if;

  select * into v_plan
  from public.plans
  where code = v_subscription.plan_code and is_active
  limit 1;

  if not found then
    raise exception 'No active plan configuration found';
  end if;

  insert into public.usage_periods (
    user_id, subscription_id, plan_code, period_start, period_end,
    analysis_limit, token_limit
  )
  values (
    v_user_id, v_subscription.id, v_plan.code, v_period_start, v_period_end,
    v_plan.analysis_limit, v_plan.token_limit
  )
  on conflict (user_id, period_start) do nothing;

  select * into v_period
  from public.usage_periods
  where user_id = v_user_id and period_start = v_period_start
  for update;

  if v_period.analysis_used >= v_period.analysis_limit then
    return query select false, v_period.id, 0;
    return;
  end if;

  update public.usage_periods
  set analysis_used = analysis_used + 1
  where id = v_period.id;

  return query select true, v_period.id, v_period.analysis_limit - v_period.analysis_used - 1;
end;
$$;

create or replace function public.release_analysis_quota(p_usage_period_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.usage_periods
  set analysis_used = greatest(analysis_used - 1, 0)
  where id = p_usage_period_id
    and user_id = auth.uid();
end;
$$;

grant execute on function public.reserve_analysis_quota() to authenticated;
grant execute on function public.release_analysis_quota(uuid) to authenticated;;
