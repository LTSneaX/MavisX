-- Named vaults: each has its own master password + AES-256-GCM key
CREATE TABLE IF NOT EXISTS vaults (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  salt         TEXT NOT NULL,           -- Argon2id salt, base64
  verifier     TEXT NOT NULL,           -- encrypted sentinel, base64
  verifier_nonce TEXT NOT NULL,         -- GCM nonce, base64
  created_at   TEXT NOT NULL
);

-- Scope vault items to a vault
ALTER TABLE vault_items ADD COLUMN vault_id TEXT NOT NULL DEFAULT 'default';

CREATE INDEX IF NOT EXISTS idx_vault_items_vault ON vault_items(vault_id);
