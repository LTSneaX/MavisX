import { invoke } from '@tauri-apps/api/core'

export interface VaultMeta {
  id: string
  name: string
  item_count: number
  created_at: string
}

export interface VaultItemMeta {
  id: string
  name: string
  type: VaultItemType
  used_by: string | null
  created_at: string
  updated_at: string
}

export type VaultItemType =
  | 'api_token'
  | 'webhook_url'
  | 'smtp'
  | 'ssh_key'
  | 'tls_cert'
  | 'username_password'
  | 'password'

export const VAULT_ITEM_TYPE_LABELS: Record<VaultItemType, string> = {
  api_token: 'API Token',
  webhook_url: 'Webhook URL',
  smtp: 'SMTP Credentials',
  ssh_key: 'SSH Key',
  tls_cert: 'TLS Certificate',
  username_password: 'Username & Password',
  password: 'Password',
}

export const vault = {
  // ── Vault management ──────────────────────────────────────────────────────
  listVaults: (): Promise<VaultMeta[]> =>
    invoke('vault_list_vaults'),

  createVault: (name: string, password: string): Promise<VaultMeta> =>
    invoke('vault_create_vault', { name, password }),

  deleteVault: (vaultId: string): Promise<void> =>
    invoke('vault_delete_vault', { vaultId }),

  renameVault: (vaultId: string, name: string): Promise<void> =>
    invoke('vault_rename_vault', { vaultId, name }),

  // ── Lock / unlock ─────────────────────────────────────────────────────────
  isUnlocked: (vaultId: string): Promise<boolean> =>
    invoke('vault_is_unlocked', { vaultId }),

  unlock: (vaultId: string, password: string): Promise<boolean> =>
    invoke('vault_unlock', { vaultId, password }),

  lock: (vaultId: string): Promise<void> =>
    invoke('vault_lock', { vaultId }),

  // ── Items ─────────────────────────────────────────────────────────────────
  listItems: (vaultId: string): Promise<VaultItemMeta[]> =>
    invoke('vault_list_items', { vaultId }),

  createItem: (vaultId: string, name: string, itemType: VaultItemType, value: string): Promise<VaultItemMeta> =>
    invoke('vault_create_item', { vaultId, name, itemType, value }),

  updateItem: (vaultId: string, id: string, name?: string, itemType?: VaultItemType, value?: string): Promise<void> =>
    invoke('vault_update_item', { vaultId, id, name, itemType, value }),

  deleteItem: (vaultId: string, id: string): Promise<void> =>
    invoke('vault_delete_item', { vaultId, id }),

  getSecret: (vaultId: string, id: string): Promise<string> =>
    invoke('vault_get_secret', { vaultId, id }),

  /** Resolve a secret by item ID when vault_id is not known (e.g. from connections.vault_item_id) */
  getSecretByItemId: (id: string): Promise<string> =>
    invoke('vault_get_secret_by_item_id', { id }),
}
