# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Run the full desktop app (starts Vite dev server + Tauri window)
pnpm tauri:dev

# TypeScript type-check only (fast, no emit)
npx tsc --noEmit

# Rust compile check (no link, much faster than full build)
cd src-tauri && cargo check

# Frontend-only dev server (no Tauri — useful for UI-only work)
pnpm dev

# Lint
pnpm lint

# Tests (browser-mode vitest via Playwright/Chromium)
pnpm test                  # headless, single run
pnpm test:watch            # watch mode
pnpm test:coverage         # coverage report

# Install Chromium for tests (first time only)
pnpm test:browser:install

# Production build
pnpm tauri:build
```

Package manager is **pnpm**. Do not use npm or yarn.

Toolchain: `stable-x86_64-pc-windows-msvc`. Rust must compile with MSVC — no MinGW/GNU targets.

---

## Architecture

MavisX is a **Tauri v2 desktop app** — a Rust backend embedded in a WebView2 window rendering a React frontend. There is no server; all persistence is local SQLite.

### Two runtimes, one process

```
src/              → React 19 + TypeScript (Vite, runs in WebView2)
src-tauri/src/    → Rust (Tauri core, async Tokio runtime)
```

The frontend calls Rust via `invoke('command_name', args)` (request/response) or `Channel<T>` (streaming). All Tauri commands are registered in `src-tauri/src/lib.rs` inside `generate_handler![]` — add a command there or it won't be callable.

### Rust modules

| File | Responsibility |
|---|---|
| `lib.rs` | Tauri builder — registers plugins, managed state, command handler, setup hook |
| `commands.rs` | SQLite migrations + one-shot invoke commands (test_monitor, check_monitor_now, generate_status_page) |
| `engine.rs` | Background tasks: `spawn_engine` (10s poll loop for monitors) + `spawn_heartbeat_server` (TCP on port 5758 for agent heartbeats) |
| `ssh.rs` | PTY sessions (`SshSessions` state, 4 commands) + exec sessions (`SshExecSessions` state, ssh_exec/ssh_exec_stop) |
| `network.rs` | Network toolkit: ping, port scan, DNS lookup, SSL info, Wake-on-LAN |
| `notify.rs` | 16 notification channel implementations dispatched by alert rules |
| `vault.rs` | AES-256-GCM credential vault — key derived by Argon2id, stored only in `VaultKey` managed state (never on disk) |
| `tray.rs` | System tray: runtime RGBA icon (green=all-up, red=any-down), click toggles window |

### SQLite access — two parallel paths

The JS frontend and Rust engine both talk to the same SQLite file (`mavisx.db` in the app data dir), using **different drivers**:

- **Frontend (JS):** `@tauri-apps/plugin-sql` → `src/lib/db.ts` — the `db` object with all SQL helpers. Singleton `Database` instance via `getDb()`.
- **Engine (Rust):** `sqlx 0.8` → `engine::connect_db(app)` returns a `SqlitePool`. WAL mode is enabled so both can coexist without locking.

Do not use `tauri-plugin-sql` from Rust or `sqlx` from JS.

### Frontend routing

TanStack Router with file-based routing. `src/routeTree.gen.ts` is **auto-generated** — never edit it manually. Add a new route by creating the file under `src/routes/` and the router plugin picks it up on next `vite` start.

Route layout:
- `src/routes/__root.tsx` — root with providers (theme, query, etc.)
- `src/routes/_authenticated/route.tsx` — auth guard (`beforeLoad` redirects to `/sign-in` if no `accessToken` cookie)
- All app pages live under `src/routes/_authenticated/`

### Feature structure

Each feature lives in `src/features/<name>/` with an `index.tsx` exporting the page component. Sub-components go in `components/`. The route file in `src/routes/` is thin — just `createFileRoute` + the component import.

### State management

- **Auth:** `src/stores/auth-store.ts` — Zustand store backed by cookie. Currently a stub (any email+password works, 7-day session).
- **Vault:** `src/stores/vault-store.ts` — Zustand store mirroring Rust vault state (isSetup, isUnlocked).
- **Server state:** TanStack Query everywhere — `queryKey: ['monitors']`, `queryKey: ['connections']`, etc. Invalidate on mutation.

### Managed Rust state

Three items registered in `lib.rs`:
```rust
.manage(vault::VaultKey(Mutex::new(None)))                     // Option<[u8;32]>
.manage(ssh::SshSessions(Mutex::new(HashMap::new())))          // PTY sessions
.manage(ssh::SshExecSessions(Mutex::new(HashMap::new())))      // exec sessions
```

**Critical pattern:** Never hold a `MutexGuard` across an `.await`. Copy values out first:
```rust
let key = { let g = state.0.lock().unwrap(); g.ok_or("locked")? };
// now await freely
```

### SSH architecture

Two separate session types, both in `ssh.rs`:

**PTY sessions** (interactive terminal): `ClientHandler` implements `russh::client::Handler` with `data()` callback that pushes bytes to a `Channel<SshEvent>`. A spawned task holds `_handle` (keeps TCP alive) and processes `SshMsg::Input` / `SshMsg::Resize` from an `mpsc::UnboundedSender`.

**Exec sessions** (log viewer): Minimal `ExecHandler` (check_server_key only). A spawned task loops on `channel.wait()` with a `tokio::select!` against a `oneshot::Receiver`. Removing the `SshExecHandle` from the map drops the `oneshot::Sender`, which cancels the task.

`channel.wait()` requires `let mut channel`. `channel.data()` takes `R: AsyncRead + Unpin` — pass `&data[..]`.

### UI design system (locked — do not deviate)

- Cards: `bg-card border border-border/50` with `w-[3px]` left-border accent strip (no gradients)
- Status colors only: red=down, emerald=up, yellow=degraded
- Page titles: `text-lg font-semibold tracking-tight` / subtitles: `text-xs text-muted-foreground`
- KPI labels: `text-[10px] font-semibold uppercase tracking-widest text-muted-foreground`
- KPI values: `text-2xl font-bold tabular-nums` (overview) / `text-xl` (detail pages)
- Buttons: `size='sm'` throughout
- Tailwind v4 is in use — no `tailwind.config.js`, config is in CSS via `@theme`

**shadcn/ui Select is not installed.** Use a native `<select>` with Tailwind classes:
```tsx
<select className='h-8 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring'>
```

### Pro gating

`workspace.plan` column is `'free'` or `'pro'`. Pro nav items have `pro: true` in `sidebar-data.ts` and are filtered out entirely in `app-sidebar.tsx` when the user is on the free plan.

### Adding a new page

1. Create `src/routes/_authenticated/<name>/index.tsx` with `createFileRoute` + component
2. Create `src/features/<name>/index.tsx` with the page component
3. Add the nav item to `src/components/layout/data/sidebar-data.ts`
4. If it needs new Rust commands: add to `src-tauri/src/` module, register in `lib.rs` `generate_handler![]`

### Adding a new Tauri command

1. Write `#[tauri::command] pub async fn my_cmd(...)` in the appropriate module
2. Add `my_module::my_cmd` to `generate_handler![]` in `lib.rs`
3. Add `invoke('my_cmd', args)` wrapper in the appropriate `src/lib/*.ts` file
