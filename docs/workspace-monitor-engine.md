# MavisX — Workspace Monitor Engine (Enterprise Alerting)

**Author:** Atlas (system architect) · **Date:** 2026-06-21 · **Status:** `DECISION` — built, **NOT yet compiled/applied**
**Component:** Enterprise (multi-tenant Supabase) workspace monitor alerting engine for the MavisX v0.3.0 Tauri cockpit.
**Built by:** Nova (built-not-verified). **Security-conditioned by:** Vera (4 conditions — all satisfied in the artifacts below).
**Grounds in:** real repo — `supabase/migrations/014_workspace_alerting.sql`, `src-tauri/src/engine.rs`, `src-tauri/src/notify.rs`, `src-tauri/src/ws_vault.rs`, and the superseded `010_ws_monitor_check_rpc.sql`.

> This is a decision record for an engine that exists on disk but has **not** been `cargo check`'d or migration-applied. It captures the design, the Vera-condition discharge, and the explicit verification gate before this can be considered live.

---

## 1. What this is

MavisX is a Tauri v2 desktop cockpit (Rust backend + React/WebView2 frontend, local SQLite, no app server). It has **two monitoring planes**:

- **Local plane** (`monitors`/`check_results`/`incidents` in local SQLite) — the existing single-user engine in `engine.rs::spawn_engine` (10s poll loop) + `spawn_heartbeat_server` (TCP 5758). Unchanged.
- **Enterprise/workspace plane** (Supabase Postgres, multi-tenant, RLS) — the subject of this doc. Workspace monitors are polled by desktop clients, results recorded via SECURITY DEFINER RPC, and alerts dispatched **from the desktop client**, not from a server.

The workspace plane is **A-hardened multi-tenant**: every write to incidents/outbox happens *inside* a SECURITY DEFINER RPC, channel secrets never touch the server, and the lease mechanism prevents N clients from N-times-dispatching the same alert.

---

## 2. The build artifacts

### 2.1 Migration `014_workspace_alerting.sql`

Four new tables plus two RPCs (one supersedes `010` by replace):

| Object | Responsibility |
|---|---|
| `workspace_incidents` | One incident row per monitor-down episode. **Partial unique index** `uq_ws_incident_open_per_monitor ON (monitor_id) WHERE status='open'` guarantees at most one open incident per monitor (race-safe). No authenticated write policy — RPC-only. |
| `workspace_alert_rules` | Routing rules: `(condition, channel, config jsonb, vault_item_id, threshold, enabled)`. `config` carries **non-secret routing only**; every credential is a `vault_item_id` reference. Channel constrained to the 16 known `notify.rs` channels. |
| `workspace_notification_outbox` | Transactional outbox the desktop client drains. Rows inserted **only** inside the result RPC; the only member write is flipping `sent_at`. |
| `workspace_poll_leases` | Single-flight dispatch ownership per workspace (`workspace_id PK`, `holder`, `lease_expires_at`). **Deny-all over PostgREST** — no policy, no GRANT; claimed only via the lease RPC. |
| `record_workspace_monitor_result(...)` | EXTENDED result RPC (supersedes `010`). One transaction: read prev status → write new status → open/resolve incident on transition → enqueue outbox row on transition. |
| `claim_workspace_poll_lease(...)` | Membership-gated, server-clamped atomic lease claim/renew. Returns true iff caller now holds the lease. |

### 2.2 `engine.rs` edits

- `run_workspace_cycle(app)` — called at the end of each `run_cycle`. Fetches enabled `workspace_monitors`, groups by workspace, claims the per-workspace lease *before* polling, dispatches due checks, and POSTs results to `record_workspace_monitor_result`.
- Lease window = `2× longest monitor interval` in the workspace, floored at 30s, then server-clamped (`LEASE_MULTIPLIER`, `LEASE_MIN_SECONDS`). If the lease isn't held, the workspace is skipped this tick.
- `drain_workspace_outbox(...)` — pulls unsent outbox rows, loads matching **admin-only** alert rules, resolves the channel secret **client-side** via `ws_vault::resolve_secret`, fires via `notify::fire_ws_rule`, then column-scoped-PATCHes `sent_at`. Vault-locked secrets → row left unsent for retry (no premature mark-sent).

### 2.3 `notify.rs` edit

- `fire_ws_rule(channel, rule_id, config, secret, title, body)` — the workspace-side dispatch entry that takes the secret as a resolved argument (not read from server config), reusing the 16 channel implementations.

---

## 3. Vera's 4 conditions — discharge

| # | Vera condition | How `014` + edits satisfy it |
|---|---|---|
| **1** | **Channel secrets must not be stored server-side in plaintext** | `workspace_alert_rules.config` is non-secret routing only. Every credential is a `vault_item_id` reference into `workspace_vault_items`. A **CHECK constraint** (`ws_alert_rules_config_no_secrets`) *rejects* any config jsonb containing `auth_token`, `api_key`, `routing_key`, `webhook_url`, or any `*_token`/`*_pass` key. A **constraint trigger** (`assert_alert_rule_vault_tenancy`) enforces that the referenced vault item shares the rule's `workspace_id`. Secrets resolve **client-side** at dispatch via `ws_vault::resolve_secret`. |
| **2** | **Alert rules must be admin-only** | `workspace_alert_rules` RLS is **admin-only on all four verbs** (SELECT/INSERT/UPDATE/DELETE), each `USING/WITH CHECK ((SELECT private.is_workspace_admin(workspace_id)))`. No member SELECT — because routing config could leak channel topology. A non-admin draining the outbox simply gets zero rules and defers to an admin client. |
| **3** | **Incidents / outbox / lease must be RPC-gated + deny-all over PostgREST** | `workspace_incidents`: member SELECT only, `GRANT SELECT` only — all writes via RPC. `workspace_notification_outbox`: member SELECT to drain + **column-scoped** `GRANT UPDATE (sent_at)` only; no INSERT/DELETE for authenticated (RPC-only inserts). `workspace_poll_leases`: **no policy, no GRANT** = deny-all over PostgREST, lease RPC the only path. |
| **4** | **`record_workspace_monitor_result` must derive ids server-side + one-open-incident guarantee; `claim_workspace_poll_lease` must assert membership + clamp** | The result RPC takes **no `p_workspace_id`** — it derives `workspace_id` + previous status from the monitor row server-side, then asserts active-member-or-owner. Incident open uses `ON CONFLICT (monitor_id) WHERE status='open' DO NOTHING` against the partial unique index = race-safe single open incident. The UPDATE is column-scoped to status/result fields. `claim_workspace_poll_lease` checks `is_workspace_member` **first**, then clamps lease seconds to `LEAST(GREATEST(p, 10), 3600)` before the atomic upsert. |

**Atlas assessment:** all four conditions are satisfied *in the artifacts*. The two structural wins worth flagging: secrets-as-vault-reference enforced by a CHECK denylist (not just convention), and the partial unique index making the one-open-incident guarantee a *database* invariant rather than application logic.

---

## 4. Architecture decision: dispatcher = desktop client

**Decision: alert dispatch runs on the desktop client (the lease-holding member's running Tauri app), NOT a server-side always-on dispatcher.**

Reasoning, against the trade-off framework:
- **Operational burden:** MavisX has *no app server* — it is a Tauri desktop app over a Supabase backend. A server-side dispatcher would mean standing up and operating a new always-on service (an edge function or a worker), which is a whole new moving part to run, secure, and monitor. The desktop client already runs the poll loop.
- **Secret custody:** channel secrets live in the **workspace vault**, unlockable only client-side. A server-side dispatcher would force secrets to be server-resolvable — which directly violates Vera condition 1. Keeping dispatch on the client is what *lets* secrets stay off the server.
- **Single-flight correctness:** the `workspace_poll_leases` mechanism ensures only one client polls + dispatches per workspace at a time, so client-side dispatch does not fan out duplicate alerts.

**Accepted trade-off (the deferred piece):** there is **no always-on dispatch path**. If no member's desktop client is running (or no admin client is running to drain the outbox), alerts queue in the outbox and fire when a qualifying client next comes online. The outbox is durable, so nothing is lost — but delivery latency is bounded by client availability, not by the server. A server-side always-on dispatcher is **explicitly deferred**, not built. If 24/7 delivery becomes a requirement, that is a new design (edge function + a server-side secret-custody decision that returns to Vera).

This is the right call for v0.3.0: it ships the capability with zero new infrastructure and preserves the secrets-off-server invariant. The always-on gap is a known, documented limitation.

---

## 5. Data flow

```
[desktop client tick] run_cycle
  → run_workspace_cycle
     → GET workspace_monitors (enabled)               (PostgREST, member RLS)
     → group by workspace
     → claim_workspace_poll_lease(ws, 2×interval)      (RPC: membership + clamp)
        └─ not held? skip workspace this tick
     → for each due monitor: dispatch_check (http/port/ping/dns/ssl/cron)
        → POST record_workspace_monitor_result          (RPC, SECURITY DEFINER)
           ├─ derive ws_id + prev status server-side
           ├─ UPDATE workspace_monitors (status cols)
           ├─ on down-transition: open incident (ON CONFLICT DO NOTHING) + enqueue outbox
           ├─ on up-transition:  resolve incident + enqueue outbox
           └─ on degraded-transition: enqueue outbox (no incident row)
  → drain_workspace_outbox
     → GET outbox WHERE sent_at IS NULL                 (member SELECT)
     → for each row: GET matching alert_rules            (ADMIN-only SELECT)
        └─ non-admin? defer row, leave unsent
     → resolve secret CLIENT-SIDE via ws_vault           (vault locked? defer row)
     → notify::fire_ws_rule(channel, config, secret, ...)
     → PATCH outbox.sent_at                              (column-scoped UPDATE)
```

**What never leaves the boundary:** channel secrets never reach the server — they live in `workspace_vault_items` and resolve only inside the client's unlocked vault.

---

## 6. NOT YET VERIFIED — the gate before live

This engine is **built-not-verified**. It has **not** been compiled or applied. Before it can be considered live:

| Check | Why | Where |
|---|---|---|
| **`cargo check`** | `engine.rs` + `notify.rs` edits are not confirmed to compile against the current crate (reqwest/sqlx/serde signatures, `fire_ws_rule`/`resolve_secret` arity). | `cd src-tauri && cargo check` |
| **Migration apply on a scratch DB** | `014` references `private.is_workspace_member`/`is_workspace_admin` (012/013), `workspace_vault_items` (011), `workspace_monitors` (009), and **supersedes** `010`'s RPC by `CREATE OR REPLACE` — apply order and the dropped `p_workspace_id` param must be validated against a real schema. | Apply `001`→`014` on a throwaway Postgres/Supabase. |
| **Toolchain note** | The repo targets **MSVC** (`stable-x86_64-pc-windows-msvc`) — both checks must run on the **Windows / Z2 box**, not this Linux host. | Windows/Z2. |

Until both pass, the four Vera conditions are satisfied **in design/source**, but the implementation is **not** confirmed runnable. No verification = not live.

---

## 7. Risks & unknowns

| Risk | Impact | Mitigation |
|---|---|---|
| Edits don't compile | Engine is dead until fixed | `cargo check` on Windows/Z2 (gate §6). |
| `010`→`014` RPC supersession breaks callers | Result writes fail silently if the new signature mismatches the client `RpcArgs` | `RpcArgs` in `engine.rs` already drops `p_workspace_id` to match `014`; validate end-to-end after migration apply. |
| Always-on gap | Alerts delayed when no client is online | Documented, accepted (§4). Durable outbox bounds loss to zero, only latency. |
| Admin-only rules + non-admin-only client online | Outbox never drains until an admin client runs | Accepted A-hardened floor; outbox persists. Surface this in ops docs. |
| Vault locked at dispatch time | Secret unresolvable, row deferred | Already handled — row left unsent, retried on a later tick. |

---

## 8. Crew handoff

| Task | Owner |
|---|---|
| `cargo check` + migration apply on scratch DB (Windows/Z2) | **Nova** (built it; verifies it) |
| Final security sign-off after the engine compiles + applies | **Vera** (confirm the 4 conditions hold in the *running* system, not just source) |
| Decide if/when an always-on server-side dispatcher is needed (new design + Vera secret-custody review) | **Atlas** on trigger, then **Vera** |
| This decision record | **Atlas** (design layer; no implementation) |
