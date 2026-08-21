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
  if v_user_id is null then raise exception 'Authentication required'; end if;

  select * into v_subscription from public.subscriptions
  where user_id = v_user_id and status in ('active', 'trialing')
    and (current_period_end is null or current_period_end > now())
  limit 1;
  if not found then raise exception 'No active subscription found'; end if;

  select * into v_plan from public.plans
  where code = v_subscription.plan_code and is_active limit 1;
  if not found then raise exception 'No active plan configuration found'; end if;

  insert into public.usage_periods (
    user_id, subscription_id, plan_code, period_start, period_end,
    analysis_limit, token_limit
  ) values (
    v_user_id, v_subscription.id, v_plan.code, v_period_start, v_period_end,
    v_plan.analysis_limit, v_plan.token_limit
  ) on conflict (user_id, period_start) do update set
    subscription_id = excluded.subscription_id,
    plan_code = excluded.plan_code,
    analysis_limit = excluded.analysis_limit,
    token_limit = excluded.token_limit;

  select * into v_period from public.usage_periods
  where user_id = v_user_id and period_start = v_period_start for update;

  if v_period.analysis_used >= v_period.analysis_limit then
    return query select false, v_period.id, 0;
    return;
  end if;

  update public.usage_periods set analysis_used = analysis_used + 1 where id = v_period.id;
  return query select true, v_period.id, v_period.analysis_limit - v_period.analysis_used - 1;
end;
$$;

revoke all on function public.reserve_analysis_quota() from public, anon;
grant execute on function public.reserve_analysis_quota() to authenticated;
