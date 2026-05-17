-- Fix: RLS infinite recursion on workspace_members
-- Root cause: policies in public schema without proper search_path isolation
-- Fix: move helper to private schema + wrap calls in (SELECT ...) per Supabase official docs

-- Step 1: private schema (not exposed to PostgREST)
CREATE SCHEMA IF NOT EXISTS private;

-- Step 2: drop ALL existing policies on workspace_members
DROP POLICY IF EXISTS "members can read workspace members" ON workspace_members;
DROP POLICY IF EXISTS "owners and admins can insert members" ON workspace_members;
DROP POLICY IF EXISTS "owners and admins can delete members" ON workspace_members;
DROP POLICY IF EXISTS "members can update own row" ON workspace_members;
DROP POLICY IF EXISTS "members can view workspace members" ON workspace_members;
DROP POLICY IF EXISTS "owner can seed themselves" ON workspace_members;
DROP POLICY IF EXISTS "admins can insert members" ON workspace_members;
DROP POLICY IF EXISTS "admins can update members" ON workspace_members;
DROP POLICY IF EXISTS "admins can delete members" ON workspace_members;
DROP POLICY IF EXISTS "view own or workspace members" ON workspace_members;
DROP POLICY IF EXISTS "seed self as owner" ON workspace_members;
DROP POLICY IF EXISTS "admins invite members" ON workspace_members;
DROP POLICY IF EXISTS "admins delete members" ON workspace_members;
DROP POLICY IF EXISTS "member updates own row" ON workspace_members;
DROP POLICY IF EXISTS "workspace_members_select" ON workspace_members;
DROP POLICY IF EXISTS "workspace_members_insert" ON workspace_members;
DROP POLICY IF EXISTS "workspace_members_update" ON workspace_members;
DROP POLICY IF EXISTS "workspace_members_delete" ON workspace_members;

-- Step 3: drop old broken public helpers
DROP FUNCTION IF EXISTS public.is_workspace_member(uuid);
DROP FUNCTION IF EXISTS public.is_workspace_admin(uuid);

-- Step 4: helper in private schema with empty search_path (mandatory per Supabase docs)
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
  );
$$;

-- Step 5: recreate policies — (SELECT fn()) wrapper forces initPlan, prevents per-row recursion
CREATE POLICY "workspace_members_select"
  ON workspace_members FOR SELECT TO authenticated
  USING ((SELECT private.is_workspace_member(workspace_id)));

CREATE POLICY "workspace_members_insert"
  ON workspace_members FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "workspace_members_update"
  ON workspace_members FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "workspace_members_delete"
  ON workspace_members FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));
