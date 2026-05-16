CREATE TABLE IF NOT EXISTS monitors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  target TEXT NOT NULL,
  interval_seconds INTEGER NOT NULL DEFAULT 300,
  timeout_seconds INTEGER NOT NULL DEFAULT 10,
  enabled INTEGER NOT NULL DEFAULT 1,
  config TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS check_results (
  id TEXT PRIMARY KEY,
  monitor_id TEXT NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  checked_at TEXT NOT NULL,
  status TEXT NOT NULL,
  response_ms INTEGER,
  detail TEXT
);

CREATE INDEX IF NOT EXISTS idx_check_results_monitor_time
  ON check_results(monitor_id, checked_at DESC);

CREATE TABLE IF NOT EXISTS incidents (
  id TEXT PRIMARY KEY,
  monitor_id TEXT NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  started_at TEXT NOT NULL,
  resolved_at TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  cause TEXT
);

CREATE TABLE IF NOT EXISTS alert_rules (
  id TEXT PRIMARY KEY,
  monitor_id TEXT,
  condition TEXT NOT NULL,
  threshold INTEGER,
  channel TEXT NOT NULL,
  config TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS workspace (
  id TEXT PRIMARY KEY DEFAULT 'local',
  name TEXT NOT NULL DEFAULT 'My Workspace',
  plan TEXT NOT NULL DEFAULT 'free',
  config TEXT
);

INSERT OR IGNORE INTO workspace (id, name, plan) VALUES ('local', 'My Workspace', 'free');
