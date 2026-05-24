import Database from '@tauri-apps/plugin-sql'
import { invoke } from '@tauri-apps/api/core'

export interface CheckSummary {
  status: 'up' | 'down' | 'degraded'
  response_ms: number | null
  detail: string | null
}

let _db: Database | null = null

async function getDb(): Promise<Database> {
  if (!_db) {
    _db = await Database.load('sqlite:mavisx.db')
  }
  return _db
}

export interface Monitor {
  id: string
  name: string
  type: string
  target: string
  interval_seconds: number
  timeout_seconds: number
  enabled: number
  config: string | null
  degraded_threshold_ms: number | null
  created_at: string
  updated_at: string
}

export interface MaintenanceWindow {
  id: string
  monitor_id: string | null
  name: string
  starts_at: string
  ends_at: string
  repeat: 'daily' | 'weekly' | 'monthly' | null
  created_at: string
}

export interface MonitorWithStatus extends Monitor {
  last_status: 'up' | 'down' | 'degraded' | null
  last_response_ms: number | null
  last_checked_at: string | null
}

export interface CheckResult {
  id: string
  monitor_id: string
  checked_at: string
  status: 'up' | 'down' | 'degraded'
  response_ms: number | null
  detail: string | null
}

export interface Incident {
  id: string
  monitor_id: string
  started_at: string
  resolved_at: string | null
  status: 'open' | 'resolved'
  cause: string | null
}

export interface AlertRule {
  id: string
  monitor_id: string | null
  condition: 'down' | 'degraded'
  threshold: number | null
  channel: string
  config: string
  enabled: number
}

export type ConnectionType = 'ssh' | 'ftp' | 'sftp' | 'rdp' | 'vnc' | 'telnet' | 'docker' | 'web'

export interface Connection {
  id: string
  name: string
  type: ConnectionType
  host: string | null
  port: number | null
  username: string | null
  vault_item_id: string | null
  config: string | null
  group_name: string | null
  tags: string | null
  last_connected_at: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export interface SaveConnectionInput {
  id?: string
  name: string
  type: ConnectionType
  host?: string
  port?: number
  username?: string
  vault_item_id?: string
  config?: string
  group_name?: string
  tags?: string
}

export interface CreateMonitorInput {
  name: string
  type: string
  target: string
  interval_seconds?: number
  timeout_seconds?: number
  config?: string
  degraded_threshold_ms?: number | null
}

export interface UpdateMonitorInput {
  id: string
  name?: string
  target?: string
  interval_seconds?: number
  timeout_seconds?: number
  enabled?: number
  config?: string
  degraded_threshold_ms?: number | null
}

export interface CreateMaintenanceWindowInput {
  monitor_id?: string | null
  name: string
  starts_at: string
  ends_at: string
  repeat?: 'daily' | 'weekly' | 'monthly' | null
}

function nowIso(): string {
  return new Date().toISOString()
}

function uuid(): string {
  return crypto.randomUUID()
}

export const db = {
  async listMonitors(): Promise<Monitor[]> {
    const d = await getDb()
    return d.select<Monitor[]>('SELECT * FROM monitors ORDER BY created_at DESC')
  },

  async listMonitorsWithStatus(): Promise<MonitorWithStatus[]> {
    const d = await getDb()
    return d.select<MonitorWithStatus[]>(`
      SELECT m.*,
        cr.status   AS last_status,
        cr.response_ms AS last_response_ms,
        cr.checked_at  AS last_checked_at
      FROM monitors m
      LEFT JOIN check_results cr ON cr.id = (
        SELECT id FROM check_results
        WHERE monitor_id = m.id
        ORDER BY checked_at DESC LIMIT 1
      )
      ORDER BY m.created_at DESC
    `)
  },

  async createMonitor(input: CreateMonitorInput): Promise<Monitor> {
    const d = await getDb()
    const id = uuid()
    const now = nowIso()
    await d.execute(
      `INSERT INTO monitors (id, name, type, target, interval_seconds, timeout_seconds, enabled, config, degraded_threshold_ms, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 1, $7, $8, $9, $9)`,
      [
        id,
        input.name,
        input.type,
        input.target,
        input.interval_seconds ?? 300,
        input.timeout_seconds ?? 10,
        input.config ?? null,
        input.degraded_threshold_ms ?? null,
        now,
      ]
    )
    const rows = await d.select<Monitor[]>('SELECT * FROM monitors WHERE id = $1', [id])
    return rows[0]
  },

  async updateMonitor(input: UpdateMonitorInput): Promise<void> {
    const d = await getDb()
    const fields: string[] = []
    const values: unknown[] = []
    let i = 1

    if (input.name !== undefined) { fields.push(`name = $${i++}`); values.push(input.name) }
    if (input.target !== undefined) { fields.push(`target = $${i++}`); values.push(input.target) }
    if (input.interval_seconds !== undefined) { fields.push(`interval_seconds = $${i++}`); values.push(input.interval_seconds) }
    if (input.timeout_seconds !== undefined) { fields.push(`timeout_seconds = $${i++}`); values.push(input.timeout_seconds) }
    if (input.enabled !== undefined) { fields.push(`enabled = $${i++}`); values.push(input.enabled) }
    if (input.config !== undefined) { fields.push(`config = $${i++}`); values.push(input.config) }
    if (input.degraded_threshold_ms !== undefined) { fields.push(`degraded_threshold_ms = $${i++}`); values.push(input.degraded_threshold_ms) }

    if (fields.length === 0) return
    fields.push(`updated_at = $${i++}`)
    values.push(nowIso())
    values.push(input.id)

    await d.execute(
      `UPDATE monitors SET ${fields.join(', ')} WHERE id = $${i}`,
      values
    )
  },

  async deleteMonitor(id: string): Promise<void> {
    const d = await getDb()
    await d.execute('DELETE FROM monitors WHERE id = $1', [id])
  },

  // ── Maintenance windows ──────────────────────────────────────────────────────

  async listMaintenanceWindows(): Promise<MaintenanceWindow[]> {
    const d = await getDb()
    return d.select<MaintenanceWindow[]>(
      `SELECT * FROM maintenance_windows ORDER BY starts_at ASC`
    )
  },

  async createMaintenanceWindow(input: CreateMaintenanceWindowInput): Promise<MaintenanceWindow> {
    const d = await getDb()
    const id = uuid()
    const now = nowIso()
    await d.execute(
      `INSERT INTO maintenance_windows (id, monitor_id, name, starts_at, ends_at, repeat, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, input.monitor_id ?? null, input.name, input.starts_at, input.ends_at, input.repeat ?? null, now]
    )
    const rows = await d.select<MaintenanceWindow[]>('SELECT * FROM maintenance_windows WHERE id = $1', [id])
    return rows[0]
  },

  async updateMaintenanceWindow(input: Partial<CreateMaintenanceWindowInput> & { id: string }): Promise<void> {
    const d = await getDb()
    const fields: string[] = []
    const values: unknown[] = []
    let i = 1
    if (input.name !== undefined) { fields.push(`name = $${i++}`); values.push(input.name) }
    if (input.monitor_id !== undefined) { fields.push(`monitor_id = $${i++}`); values.push(input.monitor_id) }
    if (input.starts_at !== undefined) { fields.push(`starts_at = $${i++}`); values.push(input.starts_at) }
    if (input.ends_at !== undefined) { fields.push(`ends_at = $${i++}`); values.push(input.ends_at) }
    if (input.repeat !== undefined) { fields.push(`repeat = $${i++}`); values.push(input.repeat) }
    if (fields.length === 0) return
    values.push(input.id)
    await d.execute(`UPDATE maintenance_windows SET ${fields.join(', ')} WHERE id = $${i}`, values)
  },

  async deleteMaintenanceWindow(id: string): Promise<void> {
    const d = await getDb()
    await d.execute('DELETE FROM maintenance_windows WHERE id = $1', [id])
  },

  async listCheckResults(monitorId: string, limit = 100): Promise<CheckResult[]> {
    const d = await getDb()
    return d.select<CheckResult[]>(
      'SELECT * FROM check_results WHERE monitor_id = $1 ORDER BY checked_at DESC LIMIT $2',
      [monitorId, limit]
    )
  },

  async listIncidents(status?: 'open' | 'resolved'): Promise<Incident[]> {
    const d = await getDb()
    if (status) {
      return d.select<Incident[]>(
        'SELECT * FROM incidents WHERE status = $1 ORDER BY started_at DESC',
        [status]
      )
    }
    return d.select<Incident[]>('SELECT * FROM incidents ORDER BY started_at DESC')
  },

  async listIncidentsWithMonitor(status?: 'open' | 'resolved'): Promise<(Incident & { monitor_name: string; monitor_type: string })[]> {
    const d = await getDb()
    const where = status ? `AND i.status = '${status}'` : ''
    return d.select(
      `SELECT i.*, m.name AS monitor_name, m.type AS monitor_type
       FROM incidents i
       LEFT JOIN monitors m ON m.id = i.monitor_id
       WHERE 1=1 ${where}
       ORDER BY i.started_at DESC
       LIMIT 200`
    )
  },

  async getUptimeHistory(days = 45): Promise<
    { id: string; name: string; day: string; up_count: number; down_count: number; degraded_count: number; check_count: number }[]
  > {
    const d = await getDb()
    return d.select(
      `SELECT m.id, m.name,
         DATE(cr.checked_at) AS day,
         SUM(CASE WHEN cr.status = 'up' THEN 1 ELSE 0 END) AS up_count,
         SUM(CASE WHEN cr.status = 'down' THEN 1 ELSE 0 END) AS down_count,
         SUM(CASE WHEN cr.status = 'degraded' THEN 1 ELSE 0 END) AS degraded_count,
         COUNT(*) AS check_count
       FROM monitors m
       LEFT JOIN check_results cr
         ON cr.monitor_id = m.id
         AND cr.checked_at > datetime('now', $1)
       WHERE m.enabled = 1
       GROUP BY m.id, m.name, DATE(cr.checked_at)
       ORDER BY m.created_at DESC, day ASC`,
      [`-${days} days`]
    )
  },

  async testMonitor(monitorType: string, target: string, timeoutSeconds: number, config?: string | null): Promise<CheckSummary> {
    return invoke('test_monitor', { monitorType, target, timeoutSeconds, config: config ?? null })
  },

  async checkMonitorNow(monitorId: string): Promise<CheckSummary> {
    return invoke('check_monitor_now', { monitorId })
  },

  async checkWsMonitorNow(
    monitorId: string,
    monitorType: string,
    target: string,
    timeoutSeconds: number,
    config: string | null | undefined,
    supabaseUrl: string,
    anonKey: string,
    accessToken: string,
  ): Promise<CheckSummary> {
    return invoke('check_ws_monitor_now', { monitorId, monitorType, target, timeoutSeconds, config: config ?? null, supabaseUrl, anonKey, accessToken })
  },

  async listStatusPages(): Promise<{ id: string; name: string; slug: string; last_generated: string | null; created_at: string }[]> {
    return invoke('list_status_pages')
  },

  async createStatusPage(name: string): Promise<{ id: string; name: string; slug: string; last_generated: string | null; created_at: string }> {
    return invoke('create_status_page', { name })
  },

  async deleteStatusPage(id: string): Promise<void> {
    return invoke('delete_status_page', { id })
  },

  async generateStatusPage(pageId: string): Promise<string> {
    return invoke('generate_status_page', { pageId })
  },

  async getWorkspacePlan(): Promise<'free' | 'pro' | 'enterprise'> {
    const d = await getDb()
    const rows = await d.select<{ plan: string }[]>('SELECT plan FROM workspace WHERE id = \'local\'')
    return (rows[0]?.plan ?? 'free') as 'free' | 'pro' | 'enterprise'
  },

  async getWorkspace(): Promise<{ name: string; plan: string; config: string | null }> {
    const d = await getDb()
    const rows = await d.select<{ name: string; plan: string; config: string | null }[]>(
      'SELECT name, plan, config FROM workspace WHERE id = \'local\''
    )
    return rows[0] ?? { name: 'My Workspace', plan: 'free', config: null }
  },

  async saveWorkspaceName(name: string): Promise<void> {
    const d = await getDb()
    await d.execute('UPDATE workspace SET name = $1 WHERE id = \'local\'', [name])
  },

  async saveWorkspaceConfig(config: { defaultInterval: number; defaultTimeout: number }): Promise<void> {
    const d = await getDb()
    await d.execute('UPDATE workspace SET config = $1 WHERE id = \'local\'', [JSON.stringify(config)])
  },

  async clearCheckHistory(): Promise<void> {
    const d = await getDb()
    await d.execute('DELETE FROM check_results')
    await d.execute('DELETE FROM incidents')
  },

  // ─── Alert Rules ────────────────────────────────────────────────────────────

  async listAlertRules(): Promise<AlertRule[]> {
    const d = await getDb()
    return d.select<AlertRule[]>('SELECT * FROM alert_rules ORDER BY rowid ASC')
  },

  async createAlertRule(input: Omit<AlertRule, 'id'>): Promise<void> {
    const d = await getDb()
    const id = uuid()
    await d.execute(
      'INSERT INTO alert_rules (id, monitor_id, condition, threshold, channel, config, enabled) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [id, input.monitor_id ?? null, input.condition, input.threshold ?? 1, input.channel, input.config, input.enabled]
    )
  },

  async updateAlertRule(id: string, updates: Partial<Omit<AlertRule, 'id'>>): Promise<void> {
    const d = await getDb()
    const fields: string[] = []
    const values: unknown[] = []
    let i = 1
    if (updates.monitor_id !== undefined) { fields.push(`monitor_id = $${i++}`); values.push(updates.monitor_id) }
    if (updates.condition !== undefined) { fields.push(`condition = $${i++}`); values.push(updates.condition) }
    if (updates.threshold !== undefined) { fields.push(`threshold = $${i++}`); values.push(updates.threshold) }
    if (updates.channel !== undefined) { fields.push(`channel = $${i++}`); values.push(updates.channel) }
    if (updates.config !== undefined) { fields.push(`config = $${i++}`); values.push(updates.config) }
    if (updates.enabled !== undefined) { fields.push(`enabled = $${i++}`); values.push(updates.enabled) }
    if (fields.length === 0) return
    values.push(id)
    await d.execute(`UPDATE alert_rules SET ${fields.join(', ')} WHERE id = $${i}`, values)
  },

  async deleteAlertRule(id: string): Promise<void> {
    const d = await getDb()
    await d.execute('DELETE FROM alert_rules WHERE id = $1', [id])
  },

  // ─── Connections ────────────────────────────────────────────────────────────

  async listConnections(): Promise<Connection[]> {
    const d = await getDb()
    return d.select<Connection[]>('SELECT * FROM connections ORDER BY group_name ASC, sort_order ASC, name ASC')
  },

  async saveConnection(input: SaveConnectionInput): Promise<void> {
    const d = await getDb()
    const now = nowIso()
    if (input.id) {
      await d.execute(
        `UPDATE connections SET name=$1, type=$2, host=$3, port=$4, username=$5,
         vault_item_id=$6, config=$7, group_name=$8, tags=$9, updated_at=$10 WHERE id=$11`,
        [input.name, input.type, input.host ?? null, input.port ?? null, input.username ?? null,
         input.vault_item_id ?? null, input.config ?? null, input.group_name ?? null,
         input.tags ?? null, now, input.id]
      )
    } else {
      await d.execute(
        `INSERT INTO connections (id, name, type, host, port, username, vault_item_id, config, group_name, tags, sort_order, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,0,$11,$11)`,
        [uuid(), input.name, input.type, input.host ?? null, input.port ?? null,
         input.username ?? null, input.vault_item_id ?? null, input.config ?? null,
         input.group_name ?? null, input.tags ?? null, now]
      )
    }
  },

  async deleteConnection(id: string): Promise<void> {
    const d = await getDb()
    await d.execute('DELETE FROM connections WHERE id = $1', [id])
  },

  async getDashboardStats(): Promise<{
    total: number
    up: number
    down: number
    activeIncidents: number
    avgResponseMs: number | null
  }> {
    const d = await getDb()

    const [monitors, incidents, avgRow] = await Promise.all([
      d.select<{ id: string; status: string | null }[]>(`
        SELECT m.id,
          (SELECT status FROM check_results WHERE monitor_id = m.id ORDER BY checked_at DESC LIMIT 1) as status
        FROM monitors m WHERE m.enabled = 1
      `),
      d.select<{ count: number }[]>('SELECT COUNT(*) as count FROM incidents WHERE status = "open"'),
      d.select<{ avg: number | null }[]>(`
        SELECT AVG(response_ms) as avg FROM check_results
        WHERE checked_at > datetime('now', '-1 hour') AND status = 'up'
      `),
    ])

    const up = monitors.filter((m) => m.status === 'up').length
    const down = monitors.filter((m) => m.status === 'down').length

    return {
      total: monitors.length,
      up,
      down,
      activeIncidents: incidents[0]?.count ?? 0,
      avgResponseMs: avgRow[0]?.avg ?? null,
    }
  },
}
