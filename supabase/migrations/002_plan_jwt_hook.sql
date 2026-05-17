-- Custom Access Token Hook
-- Embeds app_metadata.plan into every JWT from the profiles table.
-- Enable this in: Supabase Dashboard → Authentication → Hooks → Custom Access Token

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql stable
as $$
declare
  user_plan text;
begin
  select plan into user_plan
  from public.profiles
  where id = (event->>'user_id')::uuid;

  return jsonb_set(
    event,
    '{claims,app_metadata,plan}',
    to_jsonb(coalesce(user_plan, 'free'))
  );
end;
$$;

grant execute on function public.custom_access_token_hook to supabase_auth_admin;
grant usage on schema public to supabase_auth_admin;
grant select on public.profiles to supabase_auth_admin;
