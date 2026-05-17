-- Workspace-scoped monitors and connections (cloud-backed, shared across members)

-- Helper must exist before policies that reference it
CREATE OR REPLACE FUNCTION private.is_workspace_admin(p_workspace_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = p_workspace_id
      AND user_id = (SELECT auth.uid())
      AND role IN ('owner', 'admin')
      AND status = 'active'
  )
  OR EXISTS (
    SELECT 1 FROM public.workspaces
    WHERE id = p_workspace_id AND owner_id = (SELECT auth.uid())
  );
$$;

CREATE TABLE IF NOT EXISTS public.workspace_monitors (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name             text NOT NULL,
  type             text NOT NULL,
  target           text NOT NULL,
  interval_seconds int  NOT NULL DEFAULT 300,
  timeout_seconds  int  NOT NULL DEFAULT 10,
  enabled          boolean NOT NULL DEFAULT true,
  config           jsonb,
  status           text,              -- 'up'|'down'|'degraded'|'pending'
  last_checked_at  timestamptz,
  response_ms      int,
  detail           text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ws_monitors_workspace ON workspace_monitors(workspace_id);

CREATE TABLE IF NOT EXISTS public.workspace_connections (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name             text NOT NULL,
  type             text NOT NULL,
  host             text,
  port             int,
  username         text,
  config           jsonb,
  group_name       text,
  tags             jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ws_connections_workspace ON workspace_connections(workspace_id);

-- RLS
ALTER TABLE public.workspace_monitors    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_connections ENABLE ROW LEVEL SECURITY;

-- Members can read; admins can write

CREATE POLICY "ws_monitors_select"
  ON workspace_monitors FOR SELECT TO authenticated
  USING ((SELECT private.is_workspace_member(workspace_id)));

CREATE POLICY "ws_monitors_insert"
  ON workspace_monitors FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.is_workspace_admin(workspace_id)));

CREATE POLICY "ws_monitors_update"
  ON workspace_monitors FOR UPDATE TO authenticated
  USING ((SELECT private.is_workspace_admin(workspace_id)));

CREATE POLICY "ws_monitors_delete"
  ON workspace_monitors FOR DELETE TO authenticated
  USING ((SELECT private.is_workspace_admin(workspace_id)));

CREATE POLICY "ws_connections_select"
  ON workspace_connections FOR SELECT TO authenticated
  USING ((SELECT private.is_workspace_member(workspace_id)));

CREATE POLICY "ws_connections_insert"
  ON workspace_connections FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.is_workspace_admin(workspace_id)));

CREATE POLICY "ws_connections_update"
  ON workspace_connections FOR UPDATE TO authenticated
  USING ((SELECT private.is_workspace_admin(workspace_id)));

CREATE POLICY "ws_connections_delete"
  ON workspace_connections FOR DELETE TO authenticated
  USING ((SELECT private.is_workspace_admin(workspace_id)));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_monitors    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_connections TO authenticated;
