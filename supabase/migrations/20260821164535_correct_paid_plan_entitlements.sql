update public.plans
set analysis_limit = case code
  when 'pro_monthly' then 300
  when 'pro_yearly' then 500
end
where code in ('pro_monthly', 'pro_yearly');

create or replace function public.sync_active_subscription_usage()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.status in ('active', 'trialing')
    and (
      old.plan_code is distinct from new.plan_code
      or old.status not in ('active', 'trialing')
    ) then
    update public.usage_periods as usage
    set subscription_id = new.id,
        plan_code = new.plan_code,
        analysis_limit = plan.analysis_limit,
        token_limit = plan.token_limit,
        analysis_used = 0,
        tokens_used = 0
    from public.plans as plan
    where usage.user_id = new.user_id
      and usage.period_end > now()
      and plan.code = new.plan_code
      and plan.is_active;
  end if;
  return new;
end;
$$;

drop trigger if exists subscriptions_sync_active_usage on public.subscriptions;
create trigger subscriptions_sync_active_usage
after update of plan_code, status on public.subscriptions
for each row execute function public.sync_active_subscription_usage();

-- Reconcile members who paid before this correction was deployed. If their
-- current usage snapshot still belongs to the free plan, start the paid quota
-- at zero used so the full purchased entitlement is available immediately.
update public.usage_periods as usage
set subscription_id = subscription.id,
    plan_code = subscription.plan_code,
    analysis_limit = plan.analysis_limit,
    token_limit = plan.token_limit,
    analysis_used = case
      when usage.plan_code is distinct from subscription.plan_code then 0
      else usage.analysis_used
    end,
    tokens_used = case
      when usage.plan_code is distinct from subscription.plan_code then 0
      else usage.tokens_used
    end
from public.subscriptions as subscription
join public.plans as plan on plan.code = subscription.plan_code
where usage.user_id = subscription.user_id
  and usage.period_end > now()
  and subscription.status in ('active', 'trialing')
  and (subscription.current_period_end is null or subscription.current_period_end > now())
  and subscription.plan_code in ('pro_monthly', 'pro_yearly');

revoke all on function public.sync_active_subscription_usage() from public, anon, authenticated;
