-- Fix: workspaces SELECT policy still referenced public.is_workspace_member
-- which was dropped in 005. Non-owner members (free plan invitees) couldn't
-- read workspace rows at all. Switch to private.is_workspace_member.

DROP POLICY IF EXISTS "workspace members can read" ON workspaces;

CREATE POLICY "workspace members can read"
  ON workspaces FOR SELECT TO authenticated
  USING (
    owner_id = (SELECT auth.uid())
    OR (SELECT private.is_workspace_member(id))
  );
