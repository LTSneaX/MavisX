-- Named status pages — each generates its own static HTML export
CREATE TABLE IF NOT EXISTS status_pages (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  slug         TEXT NOT NULL UNIQUE,
  last_generated TEXT,
  created_at   TEXT NOT NULL
);
