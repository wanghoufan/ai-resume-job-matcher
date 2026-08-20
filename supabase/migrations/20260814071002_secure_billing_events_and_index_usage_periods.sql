create index if not exists usage_periods_subscription_id_idx on public.usage_periods(subscription_id);
create index if not exists usage_periods_plan_code_idx on public.usage_periods(plan_code);
drop policy if exists "billing events are managed server side only" on public.billing_events;
create policy "billing events are managed server side only"
on public.billing_events for all to authenticated
using (false)
with check (false);;
