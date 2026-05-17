-- Workspaces table
create table if not exists public.workspaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  owner_id    uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- Workspace members table
create table if not exists public.workspace_members (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  user_id       uuid references auth.users(id) on delete set null,
  email         text not null,
  role          text not null default 'member' check (role in ('owner', 'admin', 'member')),
  status        text not null default 'pending' check (status in ('active', 'pending')),
  invited_at    timestamptz not null default now(),
  joined_at     timestamptz
);

create index if not exists idx_workspace_members_workspace on public.workspace_members(workspace_id);
create index if not exists idx_workspace_members_user    on public.workspace_members(user_id);
create index if not exists idx_workspace_members_email   on public.workspace_members(email);

-- RLS
alter table public.workspaces        enable row level security;
alter table public.workspace_members enable row level security;

-- Workspace owners and members can read workspaces they belong to
create policy "workspace members can read"
  on public.workspaces for select
  using (
    owner_id = auth.uid() or
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = id and wm.user_id = auth.uid() and wm.status = 'active'
    )
  );

create policy "workspace owners can insert"
  on public.workspaces for insert
  with check (owner_id = auth.uid());

create policy "workspace owners can update"
  on public.workspaces for update
  using (owner_id = auth.uid());

create policy "workspace owners can delete"
  on public.workspaces for delete
  using (owner_id = auth.uid());

-- Members
create policy "members can read workspace members"
  on public.workspace_members for select
  using (
    exists (
      select 1 from public.workspaces w
      where w.id = workspace_id and (
        w.owner_id = auth.uid() or
        exists (
          select 1 from public.workspace_members wm2
          where wm2.workspace_id = w.id and wm2.user_id = auth.uid() and wm2.status = 'active'
        )
      )
    )
  );

create policy "owners and admins can insert members"
  on public.workspace_members for insert
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner', 'admin')
        and wm.status = 'active'
    )
  );

create policy "owners and admins can delete members"
  on public.workspace_members for delete
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner', 'admin')
        and wm.status = 'active'
    )
  );

create policy "members can update own row"
  on public.workspace_members for update
  using (user_id = auth.uid());

-- When a user logs in, auto-activate any pending invites matching their email
create or replace function public.activate_pending_invites()
returns trigger
language plpgsql security definer
as $$
begin
  update public.workspace_members
  set user_id = new.id, status = 'active', joined_at = now()
  where email = new.email and status = 'pending' and user_id is null;
  return new;
end;
$$;

drop trigger if exists on_auth_user_login on auth.users;
create trigger on_auth_user_login
  after update of last_sign_in_at on auth.users
  for each row execute function public.activate_pending_invites();

-- Grants
grant select, insert, update, delete on public.workspaces        to authenticated;
grant select, insert, update, delete on public.workspace_members to authenticated;
