-- Fix 1: private.is_workspace_member did not account for workspace owners who have no
--         row in workspace_members. This caused the monitor engine and all workspace
--         SELECT policies to return empty for owners.
CREATE OR REPLACE FUNCTION private.is_workspace_member(p_workspace_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = p_workspace_id
      AND user_id = (SELECT auth.uid())
      AND status = 'active'
  )
  OR EXISTS (
    SELECT 1 FROM public.workspaces
    WHERE id = p_workspace_id AND owner_id = (SELECT auth.uid())
  );
$$;

-- Fix 2: workspace_members INSERT policy only allowed inserting own user_id, blocking
--         admins from creating pending invites (where user_id is NULL).
DROP POLICY IF EXISTS "workspace_members_insert" ON workspace_members;

CREATE POLICY "workspace_members_insert"
  ON workspace_members FOR INSERT TO authenticated
  WITH CHECK (
    -- Accepting own invite (activate_my_invites RPC path, or direct self-insert)
    user_id = (SELECT auth.uid())
    -- Admin/owner creating a pending invite for someone else (user_id will be NULL)
    OR (
      user_id IS NULL
      AND (SELECT private.is_workspace_admin(workspace_id))
    )
  );
