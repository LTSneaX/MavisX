-- vault_items: encrypted credential storage (referenced by connections, alert_rules, etc.)
CREATE TABLE IF NOT EXISTS vault_items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,          -- 'api_token'|'webhook_url'|'smtp'|'ssh_key'|'tls_cert'|'username_password'
  encrypted_value TEXT NOT NULL, -- AES-256-GCM blob, base64
  nonce TEXT NOT NULL,           -- GCM nonce, base64
  used_by TEXT,                  -- JSON array of service references e.g. ["alert_rule:abc", "connection:xyz"]
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- connections: all saved connection types
CREATE TABLE IF NOT EXISTS connections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,          -- 'ssh'|'ftp'|'sftp'|'rdp'|'vnc'|'telnet'|'docker'|'web'
  host TEXT,
  port INTEGER,
  username TEXT,
  vault_item_id TEXT REFERENCES vault_items(id) ON DELETE SET NULL,
  config TEXT,                 -- JSON: type-specific fields (key_path, tls_cert, etc.)
  group_name TEXT,
  tags TEXT,                   -- JSON array
  last_connected_at TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_connections_type ON connections(type);
CREATE INDEX IF NOT EXISTS idx_connections_group ON connections(group_name);

-- web_tabs: saved internal webapp panels for Web Viewer
CREATE TABLE IF NOT EXISTS web_tabs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  icon TEXT,
  pinned INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

-- agents: registered MavisX Go agents
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  hostname TEXT,
  ip TEXT,
  os TEXT,
  arch TEXT,
  agent_version TEXT,
  last_seen_at TEXT,
  token_hash TEXT NOT NULL,    -- SHA-256 of the bearer token, never stored raw
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

-- agent_metrics: time-series data pushed by agents (30-day TTL enforced by engine)
CREATE TABLE IF NOT EXISTS agent_metrics (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  collected_at TEXT NOT NULL,
  cpu_percent REAL,
  ram_used_mb INTEGER,
  ram_total_mb INTEGER,
  disk_used_gb REAL,
  disk_total_gb REAL,
  load_1 REAL,
  load_5 REAL,
  load_15 REAL,
  payload TEXT                 -- JSON: docker stats, systemd units, extra fields
);

CREATE INDEX IF NOT EXISTS idx_agent_metrics_agent_time
  ON agent_metrics(agent_id, collected_at DESC);

-- maintenance_windows: suppress alerts during planned downtime
CREATE TABLE IF NOT EXISTS maintenance_windows (
  id TEXT PRIMARY KEY,
  monitor_id TEXT REFERENCES monitors(id) ON DELETE CASCADE, -- NULL = all monitors
  name TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  repeat TEXT,                 -- NULL | 'daily' | 'weekly' | 'monthly'
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_maintenance_monitor ON maintenance_windows(monitor_id);

-- extend monitors with degraded threshold and tags
ALTER TABLE monitors ADD COLUMN degraded_threshold_ms INTEGER;
ALTER TABLE monitors ADD COLUMN tags TEXT;              -- JSON array
