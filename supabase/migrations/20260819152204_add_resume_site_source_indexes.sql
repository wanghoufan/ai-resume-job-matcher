create index if not exists resume_sites_source_resume_id_idx
  on public.resume_sites(source_resume_id);

create index if not exists resume_sites_source_analysis_id_idx
  on public.resume_sites(source_analysis_id);
