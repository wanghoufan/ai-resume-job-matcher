create extension if not exists pgcrypto;

create type public.analysis_status as enum ('pending', 'processing', 'completed', 'failed');
create type public.application_status as enum ('draft', 'applied', 'interviewing', 'offer', 'rejected', 'withdrawn');
create type public.subscription_status as enum ('trialing', 'active', 'past_due', 'canceled', 'expired');
create type public.usage_event_status as enum ('succeeded', 'failed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_path text,
  locale text not null default 'zh-CN',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  file_path text not null unique,
  file_name text not null,
  file_size_bytes bigint not null check (file_size_bytes > 0 and file_size_bytes <= 10485760),
  extracted_text text,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.job_descriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_name text,
  position_title text not null,
  location text,
  source_url text,
  content text not null check (length(trim(content)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  resume_id uuid references public.resumes(id) on delete set null,
  job_description_id uuid references public.job_descriptions(id) on delete set null,
  status public.analysis_status not null default 'pending',
  match_score smallint check (match_score between 0 and 100),
  model text not null,
  prompt_version text not null default 'v1',
  result_json jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint analysis_completion_consistency check (
    (status = 'completed' and result_json is not null and match_score is not null and completed_at is not null)
    or (status = 'failed' and error_message is not null and completed_at is not null)
    or (status in ('pending', 'processing') and result_json is null and match_score is null and completed_at is null)
  )
);

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_description_id uuid references public.job_descriptions(id) on delete set null,
  resume_id uuid references public.resumes(id) on delete set null,
  analysis_id uuid references public.analyses(id) on delete set null,
  status public.application_status not null default 'draft',
  applied_at timestamptz,
  next_action_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  plan_code text not null default 'free',
  status public.subscription_status not null default 'active',
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz,
  provider text,
  provider_customer_id text unique,
  provider_subscription_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  analysis_id uuid references public.analyses(id) on delete set null,
  event_type text not null default 'analysis',
  model text not null,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  estimated_cost numeric(12, 6) not null default 0 check (estimated_cost >= 0),
  status public.usage_event_status not null,
  created_at timestamptz not null default now()
);

create index resumes_user_created_idx on public.resumes (user_id, created_at desc);
create unique index resumes_one_active_per_user_idx on public.resumes (user_id) where is_active;
create index job_descriptions_user_created_idx on public.job_descriptions (user_id, created_at desc);
create index analyses_user_created_idx on public.analyses (user_id, created_at desc);
create index applications_user_status_idx on public.applications (user_id, status, updated_at desc);
create index usage_events_user_created_idx on public.usage_events (user_id, created_at desc);
create index usage_events_analysis_idx on public.usage_events (analysis_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'name'));
  insert into public.subscriptions (user_id, plan_code, status)
  values (new.id, 'free', 'active');
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public;
revoke all on function public.set_updated_at() from public;

create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger resumes_set_updated_at before update on public.resumes for each row execute function public.set_updated_at();
create trigger job_descriptions_set_updated_at before update on public.job_descriptions for each row execute function public.set_updated_at();
create trigger applications_set_updated_at before update on public.applications for each row execute function public.set_updated_at();
create trigger subscriptions_set_updated_at before update on public.subscriptions for each row execute function public.set_updated_at();
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.resumes enable row level security;
alter table public.job_descriptions enable row level security;
alter table public.analyses enable row level security;
alter table public.applications enable row level security;
alter table public.subscriptions enable row level security;
alter table public.usage_events enable row level security;

create policy "users can read own profile" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "users can update own profile" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "users can manage own resumes" on public.resumes for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "users can manage own job descriptions" on public.job_descriptions for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "users can read own analyses" on public.analyses for select to authenticated using ((select auth.uid()) = user_id);
create policy "users can manage own applications" on public.applications for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "users can read own subscription" on public.subscriptions for select to authenticated using ((select auth.uid()) = user_id);
create policy "users can read own usage events" on public.usage_events for select to authenticated using ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('resumes', 'resumes', false, 10485760, array['application/pdf'])
on conflict (id) do update
set public = false, file_size_limit = 10485760, allowed_mime_types = array['application/pdf'];

create policy "users can read own resume files" on storage.objects for select to authenticated
using (bucket_id = 'resumes' and (storage.foldername(name))[1] = (select auth.uid()::text));

create policy "users can upload own resume files" on storage.objects for insert to authenticated
with check (
  bucket_id = 'resumes'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and storage.extension(name) = 'pdf'
);

create policy "users can update own resume files" on storage.objects for update to authenticated
using (bucket_id = 'resumes' and (storage.foldername(name))[1] = (select auth.uid()::text))
with check (
  bucket_id = 'resumes'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and storage.extension(name) = 'pdf'
);

create policy "users can delete own resume files" on storage.objects for delete to authenticated
using (bucket_id = 'resumes' and (storage.foldername(name))[1] = (select auth.uid()::text));;
