create or replace function public.increment_usage_tokens(p_usage_period_id uuid, p_tokens integer)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.usage_periods
  set tokens_used = tokens_used + greatest(p_tokens, 0)
  where id = p_usage_period_id
    and user_id = auth.uid();
end;
$$;
grant execute on function public.increment_usage_tokens(uuid, integer) to authenticated;;
