import { invoke } from '@tauri-apps/api/core'

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
  isSetup: (): Promise<boolean> => invoke('vault_is_setup'),

  isUnlocked: (): Promise<boolean> => invoke('vault_is_unlocked'),

  setup: (password: string): Promise<void> =>
    invoke('vault_setup', { password }),

  unlock: (password: string): Promise<boolean> =>
    invoke('vault_unlock', { password }),

  lock: (): Promise<void> => invoke('vault_lock'),

  listItems: (): Promise<VaultItemMeta[]> => invoke('vault_list_items'),

  createItem: (name: string, itemType: VaultItemType, value: string): Promise<VaultItemMeta> =>
    invoke('vault_create_item', { name, itemType, value }),

  updateItem: (
    id: string,
    name?: string,
    itemType?: VaultItemType,
    value?: string,
  ): Promise<void> =>
    invoke('vault_update_item', { id, name, itemType, value }),

  deleteItem: (id: string): Promise<void> => invoke('vault_delete_item', { id }),

  getSecret: (id: string): Promise<string> => invoke('vault_get_secret', { id }),
}
