-- Enterprise workspace vault
-- One vault per workspace (admin creates, stores KDF salt)
-- Vault items encrypted AES-256-GCM client-side; ciphertext + nonce stored here
-- Members can read to unlock + list items; only admins can write

CREATE TABLE IF NOT EXISTS public.workspace_vaults (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid UNIQUE NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  salt          text NOT NULL,  -- Argon2id KDF salt (base64)
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.workspace_vault_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name             text NOT NULL,
  item_type        text NOT NULL,  -- 'password', 'ssh_key', 'api_key'
  encrypted_value  text NOT NULL,  -- AES-GCM ciphertext (base64)
  nonce            text NOT NULL,  -- AES-GCM nonce (base64)
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ws_vault_items_workspace ON workspace_vault_items(workspace_id);

-- Link workspace_connections to a vault item (optional — for auto-credential resolve)
ALTER TABLE public.workspace_connections
  ADD COLUMN IF NOT EXISTS vault_item_id uuid REFERENCES public.workspace_vault_items(id) ON DELETE SET NULL;

-- RLS
ALTER TABLE public.workspace_vaults       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_vault_items  ENABLE ROW LEVEL SECURITY;

-- workspace_vaults: members can read (to get salt for unlock); only admins can insert
CREATE POLICY "ws_vaults_select"
  ON workspace_vaults FOR SELECT TO authenticated
  USING ((SELECT private.is_workspace_member(workspace_id)));

CREATE POLICY "ws_vaults_insert"
  ON workspace_vaults FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.is_workspace_admin(workspace_id)));

CREATE POLICY "ws_vaults_delete"
  ON workspace_vaults FOR DELETE TO authenticated
  USING ((SELECT private.is_workspace_admin(workspace_id)));

-- workspace_vault_items: members can read (ciphertext only); admins can write
CREATE POLICY "ws_vault_items_select"
  ON workspace_vault_items FOR SELECT TO authenticated
  USING ((SELECT private.is_workspace_member(workspace_id)));

CREATE POLICY "ws_vault_items_insert"
  ON workspace_vault_items FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.is_workspace_admin(workspace_id)));

CREATE POLICY "ws_vault_items_update"
  ON workspace_vault_items FOR UPDATE TO authenticated
  USING ((SELECT private.is_workspace_admin(workspace_id)));

CREATE POLICY "ws_vault_items_delete"
  ON workspace_vault_items FOR DELETE TO authenticated
  USING ((SELECT private.is_workspace_admin(workspace_id)));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_vaults       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_vault_items  TO authenticated;
