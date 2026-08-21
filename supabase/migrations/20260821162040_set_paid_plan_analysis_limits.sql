update public.plans
set analysis_limit = case code
  when 'pro_monthly' then 300
  when 'pro_yearly' then 4000
end
where code in ('pro_monthly', 'pro_yearly');

-- Keep the currently open usage snapshot in sync so existing members see the
-- new entitlement immediately, rather than only after their next analysis.
update public.usage_periods
set analysis_limit = case plan_code
  when 'pro_monthly' then 300
  when 'pro_yearly' then 4000
end
where plan_code in ('pro_monthly', 'pro_yearly')
  and period_end > now();
