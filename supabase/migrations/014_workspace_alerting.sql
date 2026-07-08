-- Workspace alerting: incident lifecycle + alert rules + notification outbox + poll lease.
-- A-hardened multi-tenant build. All writes to incidents/outbox happen INSIDE the result RPC
-- (SECURITY DEFINER); the desktop member only drains the outbox. Channel secrets stay in the
-- workspace vault (vault_item_id reference) and resolve CLIENT-SIDE — never stored server-side.
--
-- Pattern sources cited inline:
--   005_fix_workspace_rls_v2.sql  → private-schema SECURITY DEFINER helpers, (SELECT fn()) initPlan wrap
--   009_workspace_data.sql        → workspace table RLS shape (member SELECT / admin write)
--   010_ws_monitor_check_rpc.sql  → member-gated SECURITY DEFINER result RPC, derive ids server-side
--   011_workspace_vault.sql       → vault_item_id reference pattern (ON DELETE behaviour on vault items)
--   012/013                       → owner-aware is_workspace_member / is_workspace_admin

-- ─────────────────────────────────────────────────────────────────────────────
-- Tables
-- ─────────────────────────────────────────────────────────────────────────────

-- workspace_incidents — one open incident per monitor at a time (partial unique index).
-- No authenticated write policy: rows are created/resolved only inside record_workspace_monitor_result.
CREATE TABLE IF NOT EXISTS public.workspace_incidents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  monitor_id    uuid NOT NULL REFERENCES public.workspace_monitors(id) ON DELETE CASCADE,
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  cause         text,
  started_at    timestamptz NOT NULL DEFAULT now(),
  resolved_at   timestamptz
);

CREATE INDEX IF NOT EXISTS idx_ws_incidents_workspace ON public.workspace_incidents(workspace_id);
CREATE INDEX IF NOT EXISTS idx_ws_incidents_monitor   ON public.workspace_incidents(monitor_id);

-- Race-safe guarantee: at most one open incident per monitor.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ws_incident_open_per_monitor
  ON public.workspace_incidents(monitor_id) WHERE status = 'open';

-- workspace_alert_rules — admin-only on ALL FOUR verbs (no member SELECT — secrets routing).
-- config holds NON-SECRET routing only; every credential is the vault_item_id reference.
CREATE TABLE IF NOT EXISTS public.workspace_alert_rules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  monitor_id    uuid REFERENCES public.workspace_monitors(id) ON DELETE CASCADE,  -- NULL = all monitors
  condition     text NOT NULL CHECK (condition IN ('down', 'degraded')),
  channel       text NOT NULL,
  config        jsonb NOT NULL DEFAULT '{}'::jsonb,
  vault_item_id uuid REFERENCES public.workspace_vault_items(id) ON DELETE RESTRICT,
  threshold     int  NOT NULL DEFAULT 1,
  enabled       boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  -- channel must be one of the 16 known notify.rs channels
  CONSTRAINT ws_alert_rules_channel_known CHECK (channel IN (
    'discord', 'slack', 'teams', 'rocketchat', 'email', 'webhook', 'telegram',
    'pushover', 'ntfy', 'gotify', 'whatsapp', 'sms', 'pagerduty', 'opsgenie',
    'signal', 'matrix'
  )),

  -- Denylist: config jsonb must contain NO secret-bearing key. Every credential lives in the vault.
  -- Rejects any top-level key matching *_token, *_pass, auth_token, api_key, routing_key, webhook_url.
  CONSTRAINT ws_alert_rules_config_no_secrets CHECK (
    NOT EXISTS (
      SELECT 1 FROM jsonb_object_keys(config) AS k
      WHERE k = 'auth_token'
         OR k = 'api_key'
         OR k = 'routing_key'
         OR k = 'webhook_url'
         OR k LIKE '%\_token'  ESCAPE '\'
         OR k LIKE '%\_pass'   ESCAPE '\'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_ws_alert_rules_workspace ON public.workspace_alert_rules(workspace_id);
CREATE INDEX IF NOT EXISTS idx_ws_alert_rules_monitor   ON public.workspace_alert_rules(monitor_id);

-- Guarantee the referenced vault item shares the rule's workspace_id.
-- A constraint trigger enforces cross-row tenancy (CHECK can't reference other tables).
CREATE OR REPLACE FUNCTION private.assert_alert_rule_vault_tenancy()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.vault_item_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.workspace_vault_items vi
      WHERE vi.id = NEW.vault_item_id
        AND vi.workspace_id = NEW.workspace_id
    ) THEN
      RAISE EXCEPTION 'vault_item_id % does not belong to workspace %',
        NEW.vault_item_id, NEW.workspace_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_alert_rule_vault_tenancy ON public.workspace_alert_rules;
CREATE CONSTRAINT TRIGGER trg_alert_rule_vault_tenancy
  AFTER INSERT OR UPDATE ON public.workspace_alert_rules
  FOR EACH ROW EXECUTE FUNCTION private.assert_alert_rule_vault_tenancy();

-- workspace_notification_outbox — desktop member drains this. workspace_id REQUIRED (Vera).
-- Inserts are RPC-only; the only member write is flipping sent_at.
CREATE TABLE IF NOT EXISTS public.workspace_notification_outbox (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  monitor_id    uuid NOT NULL REFERENCES public.workspace_monitors(id) ON DELETE CASCADE,
  condition     text NOT NULL CHECK (condition IN ('down', 'degraded', 'up')),
  title         text NOT NULL,
  body          text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  sent_at       timestamptz
);

CREATE INDEX IF NOT EXISTS idx_ws_outbox_workspace_unsent
  ON public.workspace_notification_outbox(workspace_id) WHERE sent_at IS NULL;

-- workspace_poll_leases — single-flight dispatch ownership per workspace.
-- Deny-all over PostgREST: no authenticated policy, no GRANT. Claimed only via the lease RPC.
CREATE TABLE IF NOT EXISTS public.workspace_poll_leases (
  workspace_id      uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  holder            uuid,
  lease_expires_at  timestamptz NOT NULL
);

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.workspace_incidents          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_alert_rules         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_notification_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_poll_leases         ENABLE ROW LEVEL SECURITY;

-- workspace_incidents: members SELECT only. All writes via RPC. GRANT SELECT only.
CREATE POLICY "ws_incidents_select"
  ON public.workspace_incidents FOR SELECT TO authenticated
  USING ((SELECT private.is_workspace_member(workspace_id)));

GRANT SELECT ON public.workspace_incidents TO authenticated;

-- workspace_alert_rules: admin-only on ALL FOUR verbs (no member SELECT — routing carries config).
CREATE POLICY "ws_alert_rules_select"
  ON public.workspace_alert_rules FOR SELECT TO authenticated
  USING ((SELECT private.is_workspace_admin(workspace_id)));

CREATE POLICY "ws_alert_rules_insert"
  ON public.workspace_alert_rules FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.is_workspace_admin(workspace_id)));

CREATE POLICY "ws_alert_rules_update"
  ON public.workspace_alert_rules FOR UPDATE TO authenticated
  USING ((SELECT private.is_workspace_admin(workspace_id)))
  WITH CHECK ((SELECT private.is_workspace_admin(workspace_id)));

CREATE POLICY "ws_alert_rules_delete"
  ON public.workspace_alert_rules FOR DELETE TO authenticated
  USING ((SELECT private.is_workspace_admin(workspace_id)));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_alert_rules TO authenticated;

-- workspace_notification_outbox: member SELECT to drain; member UPDATE scoped to sent_at ONLY.
-- No INSERT/DELETE for authenticated (inserts are RPC-only). No blanket GRANT.
CREATE POLICY "ws_outbox_select"
  ON public.workspace_notification_outbox FOR SELECT TO authenticated
  USING ((SELECT private.is_workspace_member(workspace_id)));

CREATE POLICY "ws_outbox_update_sent"
  ON public.workspace_notification_outbox FOR UPDATE TO authenticated
  USING ((SELECT private.is_workspace_member(workspace_id)))
  WITH CHECK ((SELECT private.is_workspace_member(workspace_id)));

-- Column-scoped: members may touch ONLY sent_at. All other columns stay RPC-owned.
GRANT SELECT ON public.workspace_notification_outbox TO authenticated;
GRANT UPDATE (sent_at) ON public.workspace_notification_outbox TO authenticated;

-- workspace_poll_leases: deny-all over PostgREST. No policy, no GRANT. Lease RPC only.

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC: record_workspace_monitor_result (EXTENDED — supersedes 010 by replace).
-- One transaction: read prev status → write new status → open/resolve incident on transition
-- → enqueue outbox row on transition. workspace_id + monitor_id derived SERVER-SIDE from p_id.
-- No p_workspace_id param. UPDATE column-scoped to status/result columns only.
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
-- RPC: claim_workspace_poll_lease — single-flight dispatch ownership.
-- Asserts membership FIRST, clamps lease seconds server-side, then atomic upsert.
-- Returns true iff the caller now holds the lease.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.claim_workspace_poll_lease(
  p_workspace_id  uuid,
  p_lease_seconds int
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid     uuid := (SELECT auth.uid());
  v_seconds int;
  v_holder  uuid;
BEGIN
  -- Membership gate FIRST.
  IF NOT (SELECT private.is_workspace_member(p_workspace_id)) THEN
    RAISE EXCEPTION 'not a member of this workspace';
  END IF;

  -- Clamp lease window to a sane server-side max (and floor).
  v_seconds := LEAST(GREATEST(COALESCE(p_lease_seconds, 60), 10), 3600);

  -- Atomic claim/renew: take the lease if free, expired, or already ours.
  INSERT INTO public.workspace_poll_leases (workspace_id, holder, lease_expires_at)
  VALUES (p_workspace_id, v_uid, now() + make_interval(secs => v_seconds))
  ON CONFLICT (workspace_id) DO UPDATE
    SET holder           = EXCLUDED.holder,
        lease_expires_at = EXCLUDED.lease_expires_at
    WHERE public.workspace_poll_leases.lease_expires_at < now()
       OR public.workspace_poll_leases.holder = v_uid
  RETURNING holder INTO v_holder;

  IF v_holder IS NOT NULL THEN
    RETURN v_holder = v_uid;
  END IF;

  -- ON CONFLICT WHERE was false (held by someone else, unexpired): no row returned.
  SELECT holder INTO v_holder
    FROM public.workspace_poll_leases
   WHERE workspace_id = p_workspace_id;

  RETURN COALESCE(v_holder = v_uid, false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_workspace_poll_lease(uuid, int) TO authenticated;
