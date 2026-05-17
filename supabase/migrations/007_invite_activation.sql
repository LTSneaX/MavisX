-- Fix: pending invites not activating on login
-- The trigger on last_sign_in_at is unreliable in Supabase
-- Fix: security definer RPC called from the client on every login

-- Fix SELECT policy so users can see rows where their email is invited (pending)
DROP POLICY IF EXISTS "workspace_members_select" ON workspace_members;

CREATE POLICY "workspace_members_select"
  ON workspace_members FOR SELECT TO authenticated
  USING (
    (SELECT private.is_workspace_member(workspace_id))
    OR user_id = (SELECT auth.uid())
    OR email = (SELECT auth.email())
  );

-- RPC: activate all pending invites for the calling user's email
CREATE OR REPLACE FUNCTION public.activate_my_invites()
RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.workspace_members
  SET
    user_id   = (SELECT auth.uid()),
    status    = 'active',
    joined_at = now()
  WHERE
    email     = (SELECT auth.email())
    AND status    = 'pending'
    AND user_id IS NULL;
$$;

GRANT EXECUTE ON FUNCTION public.activate_my_invites() TO authenticated;
