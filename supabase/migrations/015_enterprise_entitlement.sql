-- Enterprise entitlement enforcement — server-side, RLS-anchored.
--
-- Design: Atlas (2026-07-09), approved by SneaX (4 decisions). Built by Nova.
-- HARD GATE: Vera security review required BEFORE this migration is applied to prod.
--
-- Trust anchor = the workspace OWNER's public.profiles.plan, written ONLY by the
-- lemon-webhook via service_role. The member's JWT app_metadata.plan is NEVER
-- consulted for workspace access — that was the pre-existing bypassable bug.
--
-- Model (computed on read, NOT stored — one nullable column, zero cron):
--   owner plan = 'enterprise', grace_until NULL        → ACTIVE   (read + write)
--   owner not enterprise, now() < grace_until          → GRACE    (read-only, 14d)
--   owner not enterprise, now() >= grace_until (or set) → LOCKED   (no member read)
--
-- The whole backend already funnels workspace access through two private helpers:
--   private.is_workspace_member(ws)  → every member SELECT  (012 / 008 / 009 / 014)
--   private.is_workspace_admin(ws)   → every admin write     (009 / 013 / 014)
-- Folding an entitlement predicate into each cascades across ~90% of the surface.
-- Only 4 non-helper spots need an individual patch (below).
--
-- Pattern sources cited inline:
--   012_fix_member_owner_access.sql  → owner-aware is_workspace_member shape
--   009_workspace_data.sql           → owner-aware is_workspace_admin shape
--   005/014                          → private-schema SECURITY DEFINER, search_path='', (SELECT fn()) wrap
--   003_workspaces.sql               → workspaces INSERT/UPDATE creator/owner policies
--   014_workspace_alerting.sql       → record_workspace_monitor_result RPC (re-created here)
--   007_invite_activation.sql        → activate_my_invites RPC (re-created here)

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Schema: the single nullable grace column. Writable ONLY by service_role
--    (the webhook); no authenticated GRANT/policy ever exposes it for write.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS grace_until timestamptz;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Trust-anchor reader: the OWNER's plan for a given workspace.
--    SECURITY DEFINER so it can cross the profiles privacy boundary (profiles RLS
--    only lets a user read their OWN row). Returns ONLY the plan string, never a
--    row or an arbitrary column — not an oracle. Lives in `private`, which
--    PostgREST does not expose, so it is unreachable as a direct RPC.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION private.workspace_owner_plan(p_workspace_id uuid)
RETURNS text
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = ''
AS $$
  SELECT p.plan
  FROM public.workspaces w
  JOIN public.profiles p ON p.id = w.owner_id
  WHERE w.id = p_workspace_id;
$$;

-- The CALLER's own plan (used only by the workspaces INSERT creation guard, where
-- the new workspace row does not yet exist so workspace_owner_plan cannot see it).
CREATE OR REPLACE FUNCTION private.current_user_plan()
RETURNS text
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = ''
AS $$
  SELECT p.plan
  FROM public.profiles p
  WHERE p.id = (SELECT auth.uid());
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Entitlement predicates.
--    WRITE = owner is enterprise.
--    READ  = owner is enterprise OR the workspace is within its grace window.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION private.workspace_entitled_write(p_workspace_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = ''
AS $$
  SELECT private.workspace_owner_plan(p_workspace_id) = 'enterprise';
$$;

CREATE OR REPLACE FUNCTION private.workspace_entitled_read(p_workspace_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = ''
AS $$
  SELECT private.workspace_owner_plan(p_workspace_id) = 'enterprise'
      OR EXISTS (
        SELECT 1 FROM public.workspaces w
        WHERE w.id = p_workspace_id
          AND w.grace_until IS NOT NULL
          AND now() < w.grace_until
      );
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. THE CASCADE: fold the predicates into the two chokepoint helpers.
--    Membership/admin status is now necessary but NOT sufficient — the owner's
--    entitlement must also hold. This propagates to every table/RPC/policy that
--    already routes through these two helpers, including member-invite writes
--    (workspace_members INSERT → is_workspace_admin), so "block new members when
--    lapsed" comes for free.
-- ─────────────────────────────────────────────────────────────────────────────

-- is_workspace_member (base shape from 012) AND read-entitled.
CREATE OR REPLACE FUNCTION private.is_workspace_member(p_workspace_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = ''
AS $$
  SELECT (
    EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = p_workspace_id
        AND user_id = (SELECT auth.uid())
        AND status = 'active'
    )
    OR EXISTS (
      SELECT 1 FROM public.workspaces
      WHERE id = p_workspace_id AND owner_id = (SELECT auth.uid())
    )
  )
  AND private.workspace_entitled_read(p_workspace_id);
$$;

-- is_workspace_admin (base shape from 009) AND write-entitled.
CREATE OR REPLACE FUNCTION private.is_workspace_admin(p_workspace_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = ''
AS $$
  SELECT (
    EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = p_workspace_id
        AND user_id = (SELECT auth.uid())
        AND role IN ('owner', 'admin')
        AND status = 'active'
    )
    OR EXISTS (
      SELECT 1 FROM public.workspaces
      WHERE id = p_workspace_id AND owner_id = (SELECT auth.uid())
    )
  )
  AND private.workspace_entitled_write(p_workspace_id);
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Non-helper patch (1/4): workspaces INSERT creation guard.
--    A workspace can be created ONLY by a caller who is themselves enterprise
--    (the creator becomes the first owner). Defense-in-depth: even if the client
--    guard is bypassed, a non-enterprise user cannot mint a workspace.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "workspace owners can insert" ON public.workspaces;

CREATE POLICY "workspace owners can insert"
  ON public.workspaces FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = (SELECT auth.uid())
    AND (SELECT private.current_user_plan()) = 'enterprise'
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Non-helper patch (2/4): workspaces owner mutation gate.
--    Owner SELECT stays OPEN (008 keeps the owner_id branch) so a lapsed owner can
--    still see the workspace shell to resubscribe. But the owner's UPDATE (rename)
--    path is gated on write-entitlement. DELETE stays open — an owner may always
--    remove their own workspace (data-ownership right; retention is about NOT
--    auto-purging, it does not trap the owner).
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "workspace owners can update" ON public.workspaces;

CREATE POLICY "workspace owners can update"
  ON public.workspaces FOR UPDATE TO authenticated
  USING (
    owner_id = (SELECT auth.uid())
    AND (SELECT private.workspace_entitled_write(id))
  );

-- Vera HIGH #1 remediation: grace_until must be service_role-only.
-- 003_workspaces.sql:115 granted table-level INSERT/UPDATE on public.workspaces to
-- `authenticated`, which silently covers the new grace_until column — an enterprise
-- owner could PATCH grace_until far into the future, then cancel, and the webhook's
-- `WHERE grace_until IS NULL` guard would never overwrite it → indefinite free
-- read + monitoring. Column-scope the authenticated grants so authenticated can
-- only ever write the columns the design intends (name on rename; id/name/owner_id
-- on create). grace_until (and created_at) are left writable ONLY by service_role
-- (the webhook). Mirrors the 014:176 `GRANT UPDATE (sent_at)` column-scope precedent.
REVOKE INSERT, UPDATE ON public.workspaces FROM authenticated;
GRANT  INSERT (id, name, owner_id) ON public.workspaces TO authenticated;
GRANT  UPDATE (name)               ON public.workspaces TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Non-helper patch (3/4): record_workspace_monitor_result.
--    Re-created verbatim from 014 with ONE added gate: reject when the workspace
--    is not read-entitled, so a LOCKED workspace's poll loop cannot keep writing
--    results/incidents/outbox. During GRACE (read-entitled) polling continues —
--    grace is read-only for USER mutations, not a hard monitoring stop; the hard
--    stop is LOCK, which this gate and the folded is_workspace_member both enforce.
--    The inline membership check is retained (this RPC never used is_workspace_member).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.record_workspace_monitor_result(
  p_id              uuid,
  p_status          text,
  p_last_checked_at timestamptz,
  p_response_ms     int,
  p_detail          text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_workspace_id uuid;
  v_target       text;
  v_prev_status  text;
  v_title        text;
  v_body         text;
  v_condition    text;
BEGIN
  -- Derive workspace + previous status from the monitor row (server-side, never caller-supplied).
  SELECT wm.workspace_id, wm.status, wm.target
    INTO v_workspace_id, v_prev_status, v_target
    FROM public.workspace_monitors wm
   WHERE wm.id = p_id;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'monitor % not found', p_id;
  END IF;

  -- Caller must be an active member OR the owner of this monitor's workspace (matches 010 gate).
  IF NOT (
    EXISTS (
      SELECT 1 FROM public.workspace_members mem
      WHERE mem.workspace_id = v_workspace_id
        AND mem.user_id = (SELECT auth.uid())
        AND mem.status = 'active'
    )
    OR EXISTS (
      SELECT 1 FROM public.workspaces ws
      WHERE ws.id = v_workspace_id
        AND ws.owner_id = (SELECT auth.uid())
    )
  ) THEN
    RAISE EXCEPTION 'not a member of this workspace';
  END IF;

  -- Entitlement gate (015): a LOCKED workspace (owner lapsed past grace) must not
  -- keep writing. Read-entitled = owner enterprise OR within grace; both allow the
  -- poll loop, LOCK denies it. Fail-closed.
  IF NOT (SELECT private.workspace_entitled_read(v_workspace_id)) THEN
    RAISE EXCEPTION 'workspace entitlement lapsed';
  END IF;

  -- Write the new result. Column-scoped to status/result fields only (matches 010).
  UPDATE public.workspace_monitors
     SET status          = p_status,
         last_checked_at = p_last_checked_at,
         response_ms     = p_response_ms,
         detail          = p_detail,
         updated_at      = now()
   WHERE id = p_id;

  -- ── Incident lifecycle + outbox on transition ──
  -- Went down: new 'down', previous not 'down'.
  IF p_status = 'down' AND v_prev_status IS DISTINCT FROM 'down' THEN
    -- Partial unique index guards against a concurrent double-open; swallow that one conflict.
    INSERT INTO public.workspace_incidents (workspace_id, monitor_id, status, cause, started_at)
    VALUES (v_workspace_id, p_id, 'open', p_detail, p_last_checked_at)
    ON CONFLICT (monitor_id) WHERE status = 'open' DO NOTHING;

    v_title := v_target || ' is DOWN';
    v_body  := COALESCE(p_detail, 'Monitor is unreachable');
    INSERT INTO public.workspace_notification_outbox
      (workspace_id, monitor_id, condition, title, body)
    VALUES (v_workspace_id, p_id, 'down', v_title, v_body);

  -- Came up: new not 'down', previous was 'down'. Resolve the open incident.
  ELSIF p_status IS DISTINCT FROM 'down' AND v_prev_status = 'down' THEN
    UPDATE public.workspace_incidents
       SET status = 'resolved', resolved_at = p_last_checked_at
     WHERE monitor_id = p_id AND status = 'open';

    v_title := v_target || ' is back UP';
    v_body  := 'Monitor has recovered.';
    INSERT INTO public.workspace_notification_outbox
      (workspace_id, monitor_id, condition, title, body)
    VALUES (v_workspace_id, p_id, 'up', v_title, v_body);

  -- Degraded transition (into 'degraded' from a non-degraded state): notify, no incident row.
  ELSIF p_status = 'degraded' AND v_prev_status IS DISTINCT FROM 'degraded' THEN
    v_title := v_target || ' is DEGRADED';
    v_body  := COALESCE(p_detail, 'Monitor is responding slowly');
    INSERT INTO public.workspace_notification_outbox
      (workspace_id, monitor_id, condition, title, body)
    VALUES (v_workspace_id, p_id, 'degraded', v_title, v_body);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_workspace_monitor_result(uuid, text, timestamptz, int, text)
  TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Non-helper patch (4/4): activate_my_invites.
--    Re-created from 007 with a write-entitlement gate: a pending invite can be
--    accepted ONLY into a workspace whose owner is currently enterprise. This
--    mirrors the invite-CREATION gate (workspace_members INSERT → is_workspace_admin
--    → write-entitled) so a lapsed workspace gains no new active members from
--    either side. Grace is read-only: no new members during grace.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.activate_my_invites()
RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.workspace_members wm
  SET
    user_id   = (SELECT auth.uid()),
    status    = 'active',
    joined_at = now()
  WHERE
    wm.email     = (SELECT auth.email())
    AND wm.status    = 'pending'
    AND wm.user_id IS NULL
    AND (SELECT private.workspace_entitled_write(wm.workspace_id));
$$;

GRANT EXECUTE ON FUNCTION public.activate_my_invites() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Vera HIGH #2 remediation: close the un-invited cross-tenant self-join.
--    The 012 workspace_members INSERT policy allowed `user_id = auth.uid()`
--    UNCONDITIONALLY — any authenticated user could insert themselves as an
--    active admin into ANY workspace_id, which (now that 015 rests entitlement on
--    membership) is full read+write into another tenant's paid workspace.
--    Tightened to exactly the two self-insert flows that actually exist in the
--    client (traced):
--      (a) admin/owner creating a PENDING invite for someone else (user_id NULL);
--      (b) the owner self-seeding their OWN membership row at workspace creation.
--    There is deliberately NO "accept invite via self-INSERT" branch: invite
--    acceptance goes exclusively through activate_my_invites() (SECURITY DEFINER
--    UPDATE of the existing pending row) — route.tsx calls the RPC on login; no
--    direct client INSERT-on-accept path exists. Kept as tight as the real flows
--    allow (Vera's optional 3rd branch omitted by design; re-add if a direct
--    accept-INSERT path is ever introduced).
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "workspace_members_insert" ON public.workspace_members;

CREATE POLICY "workspace_members_insert"
  ON public.workspace_members FOR INSERT TO authenticated
  WITH CHECK (
    -- (a) Admin/owner creating a pending invite for someone else (user_id NULL).
    (user_id IS NULL AND (SELECT private.is_workspace_admin(workspace_id)))
    -- (b) Owner self-seeding their own membership row for a workspace they own.
    OR (
      user_id = (SELECT auth.uid())
      AND EXISTS (
        SELECT 1 FROM public.workspaces w
        WHERE w.id = workspace_id
          AND w.owner_id = (SELECT auth.uid())
      )
    )
  );
