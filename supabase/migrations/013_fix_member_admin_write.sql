-- Fix: workspace_members DELETE and UPDATE policies only allowed users to modify
-- their own row (user_id = auth.uid()), blocking admins from managing members.

DROP POLICY IF EXISTS "workspace_members_delete" ON workspace_members;
DROP POLICY IF EXISTS "workspace_members_update" ON workspace_members;

-- Admins/owners can delete any non-owner row; members can remove themselves
CREATE POLICY "workspace_members_delete"
  ON workspace_members FOR DELETE TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR (
      role != 'owner'
      AND (SELECT private.is_workspace_admin(workspace_id))
    )
  );

-- Admins/owners can update role; users can update their own row
CREATE POLICY "workspace_members_update"
  ON workspace_members FOR UPDATE TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR (SELECT private.is_workspace_admin(workspace_id))
  );
