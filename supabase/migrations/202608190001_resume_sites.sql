create table if not exists public.resume_sites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null check (source_type in ('pdf_upload', 'analysis_history')),
  source_resume_id uuid references public.resumes(id) on delete set null,
  source_analysis_id uuid references public.analyses(id) on delete set null,
  source_text text,
  title text not null default '未命名在线简历',
  theme_key text not null default 'clean-professional' check (theme_key in ('clean-professional', 'product-launch', 'creative-portfolio', 'enterprise-tech')),
  draft_content jsonb not null default '{}'::jsonb,
  content_schema_version text not null default 'v1',
  generation_status text not null default 'ready' check (generation_status in ('generating', 'ready', 'failed')),
  generation_error text,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.resume_site_publications (
  site_id uuid primary key references public.resume_sites(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(slug) between 3 and 48),
  theme_key text not null check (theme_key in ('clean-professional', 'product-launch', 'creative-portfolio', 'enterprise-tech')),
  content_json jsonb not null,
  content_schema_version text not null default 'v1',
  seo_title text not null,
  seo_description text not null default '',
  is_active boolean not null default true,
  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists resume_sites_user_updated_idx on public.resume_sites(user_id, updated_at desc);
create index if not exists resume_publications_user_updated_idx on public.resume_site_publications(user_id, updated_at desc);
create index if not exists resume_publications_active_slug_idx on public.resume_site_publications(slug) where is_active = true;

alter table public.resume_sites enable row level security;
alter table public.resume_site_publications enable row level security;

create policy "resume_sites_owner_select" on public.resume_sites for select to authenticated using ((select auth.uid()) = user_id);
create policy "resume_sites_owner_insert" on public.resume_sites for insert to authenticated with check (
  (select auth.uid()) = user_id
  and (source_resume_id is null or exists (select 1 from public.resumes r where r.id = source_resume_id and r.user_id = (select auth.uid())))
  and (source_analysis_id is null or exists (select 1 from public.analyses a where a.id = source_analysis_id and a.user_id = (select auth.uid())))
);
create policy "resume_sites_owner_update" on public.resume_sites for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "resume_sites_owner_delete" on public.resume_sites for delete to authenticated using ((select auth.uid()) = user_id);

create policy "resume_publications_public_read" on public.resume_site_publications for select to anon, authenticated using (is_active or (select auth.uid()) = user_id);
create policy "resume_publications_owner_insert" on public.resume_site_publications for insert to authenticated with check ((select auth.uid()) = user_id and exists (select 1 from public.resume_sites s where s.id = site_id and s.user_id = (select auth.uid())));
create policy "resume_publications_owner_update" on public.resume_site_publications for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "resume_publications_owner_delete" on public.resume_site_publications for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.resume_sites to authenticated;
grant select on public.resume_site_publications to anon;
grant select, insert, update, delete on public.resume_site_publications to authenticated;
