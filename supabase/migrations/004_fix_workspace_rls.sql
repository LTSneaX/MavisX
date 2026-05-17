-- Fix: infinite recursion in workspace_members RLS policies
-- Old policies referenced workspace_members in subqueries → recursion
-- Fix: security definer helper functions that bypass RLS

-- Drop broken policies
DROP POLICY IF EXISTS "members can view their workspace members" ON workspace_members;
DROP POLICY IF EXISTS "admins can insert members" ON workspace_members;
DROP POLICY IF EXISTS "admins can update members" ON workspace_members;
DROP POLICY IF EXISTS "admins can delete members" ON workspace_members;
DROP POLICY IF EXISTS "owners can manage members" ON workspace_members;
DROP POLICY IF EXISTS "owner can seed themselves" ON workspace_members;
DROP POLICY IF EXISTS "members can view workspace members" ON workspace_members;

-- Helper functions (SECURITY DEFINER bypasses RLS to avoid recursion)
CREATE OR REPLACE FUNCTION is_workspace_member(wsid uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = wsid AND user_id = auth.uid() AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION is_workspace_admin(wsid uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = wsid AND user_id = auth.uid()
      AND role IN ('owner', 'admin') AND status = 'active'
  );
$$;

-- Recreate policies using helpers (no self-referencing subqueries)
CREATE POLICY "members can view workspace members"
  ON workspace_members FOR SELECT
  USING (is_workspace_member(workspace_id) OR user_id = auth.uid());

-- Owners seeding themselves on workspace creation (not yet in workspace_members)
CREATE POLICY "owner can seed themselves"
  ON workspace_members FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "admins can insert members"
  ON workspace_members FOR INSERT
  WITH CHECK (is_workspace_admin(workspace_id));

CREATE POLICY "admins can update members"
  ON workspace_members FOR UPDATE
  USING (is_workspace_admin(workspace_id));

CREATE POLICY "admins can delete members"
  ON workspace_members FOR DELETE
  USING (is_workspace_admin(workspace_id));
