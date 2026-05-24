-- RPC for writing workspace monitor check results.
-- SECURITY DEFINER + member check so any workspace member (not just admin)
-- can write check results from their running Tauri client.
-- Only updates the check-result columns — not name/target/config.

CREATE OR REPLACE FUNCTION public.record_workspace_monitor_result(
  p_id            uuid,
  p_status        text,
  p_last_checked_at timestamptz,
  p_response_ms   int,
  p_detail        text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Caller must be an active member OR the owner of this monitor's workspace
  IF NOT (
    EXISTS (
      SELECT 1 FROM public.workspace_monitors wm
      JOIN public.workspace_members mem ON mem.workspace_id = wm.workspace_id
      WHERE wm.id = p_id
        AND mem.user_id = (SELECT auth.uid())
        AND mem.status = 'active'
    )
    OR EXISTS (
      SELECT 1 FROM public.workspace_monitors wm
      JOIN public.workspaces ws ON ws.id = wm.workspace_id
      WHERE wm.id = p_id
        AND ws.owner_id = (SELECT auth.uid())
    )
  ) THEN
    RAISE EXCEPTION 'not a member of this workspace';
  END IF;

  UPDATE public.workspace_monitors
  SET
    status          = p_status,
    last_checked_at = p_last_checked_at,
    response_ms     = p_response_ms,
    detail          = p_detail,
    updated_at      = now()
  WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_workspace_monitor_result TO authenticated;
