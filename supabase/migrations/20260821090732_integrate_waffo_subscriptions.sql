insert into public.plans (code, name, description, monthly_price_cents, currency, analysis_limit, token_limit)
values
  ('pro_monthly', '月度会员', 'Waffo Pancake 测试环境月度订阅。', 100, 'USD', 5, 500000),
  ('pro_yearly', '年度会员', 'Waffo Pancake 测试环境年度订阅。', 42, 'USD', 5, 500000)
on conflict (code) do update set name = excluded.name, description = excluded.description, monthly_price_cents = excluded.monthly_price_cents, currency = excluded.currency;

create or replace function public.process_waffo_subscription_event(
  p_provider_event_id text, p_user_id uuid, p_plan_code text,
  p_subscription_status public.subscription_status, p_order_id text, p_event_type text,
  p_amount_cents integer, p_currency text, p_occurred_at timestamptz,
  p_period_start timestamptz, p_period_end timestamptz, p_payload jsonb
)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_event_id uuid; v_subscription_id uuid;
begin
  if p_plan_code not in ('pro_monthly', 'pro_yearly') then raise exception 'Unsupported plan'; end if;
  insert into public.billing_events (provider, provider_event_id, user_id, event_type, status, amount_cents, currency, payload, occurred_at)
  values ('waffo', p_provider_event_id, p_user_id, p_event_type, 'processing', p_amount_cents, p_currency, coalesce(p_payload, '{}'::jsonb), p_occurred_at)
  on conflict (provider, provider_event_id) do nothing returning id into v_event_id;
  if v_event_id is null then return false; end if;
  insert into public.subscriptions (user_id, plan_code, status, current_period_start, current_period_end, provider, provider_subscription_id)
  values (p_user_id, p_plan_code, p_subscription_status, coalesce(p_period_start, now()), p_period_end, 'waffo', p_order_id)
  on conflict (user_id) do update set plan_code=excluded.plan_code,status=excluded.status,current_period_start=excluded.current_period_start,current_period_end=excluded.current_period_end,provider=excluded.provider,provider_subscription_id=excluded.provider_subscription_id,updated_at=now()
  returning id into v_subscription_id;
  update public.billing_events set subscription_id=v_subscription_id,status='processed' where id=v_event_id;
  return true;
end; $$;

revoke all on function public.process_waffo_subscription_event(text,uuid,text,public.subscription_status,text,text,integer,text,timestamptz,timestamptz,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.process_waffo_subscription_event(text,uuid,text,public.subscription_status,text,text,integer,text,timestamptz,timestamptz,timestamptz,jsonb) to service_role;
