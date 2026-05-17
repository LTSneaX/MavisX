# MavisX

**"The only app an IT guy needs open."**

A Tauri v2 desktop app that replaces Uptime Kuma, Termius, FileZilla, Portainer, Grafana, Royal TSX, and your browser tabs to internal webapps — all in one window. Local-first, no cloud required, ships as a native Windows installer.

---

## What's built

| Module | Tier | Status |
|---|---|---|
| Uptime monitoring (HTTP, port, ping, DNS, SSL, cron/heartbeat) | Free | ✅ |
| Incident tracking | Free | ✅ |
| Alert rules + 16 notification channels | Free / Pro | ✅ |
| Connection Manager (SSH, SFTP, FTP, RDP, VNC, Docker, Web) | Free | ✅ |
| Network Toolkit (ping, port scan, DNS, SSL, WoL, HTTP headers, subnet calc) | Free / Pro | ✅ |
| Web Viewer (in-app iframe browser, bookmarks) | Pro | ✅ |
| SSH Terminal (multi-tab, PTY, xterm.js + WebGL) | Pro | ✅ |
| SFTP File Manager (browse, upload, download, edit, rename, delete) | Pro | ✅ |
| Log Viewer (SSH exec, live tail, 10 presets) | Pro | ✅ |
| Status Page (static HTML export, host anywhere) | Pro | ✅ |
| Agent Metrics Dashboard (SSH-based, live CPU/RAM/disk/net, multi-tab) | Pro | ✅ |
| Docker Manager (SSH-based, containers + images, start/stop/logs) | Pro | ✅ |
| Credential Vault (AES-256-GCM + Argon2id, multi-vault, per-vault master password) | Pro | ✅ |
| Upgrade page (Free / Pro / Enterprise pricing) | — | ✅ |
| Cloud auth (Supabase — accounts, invite flow, JWT plan tokens) | All | ✅ |
| Enterprise workspace (invite, RBAC, shared monitors/connections) | Enterprise | ✅ |
| Plan gate enforcement | Pro | 🔲 Next |
| Billing (Lemon Squeezy — Pro/Enterprise checkout) | Pro/Enterprise | 🔲 Next |
| Workspace monitor checking engine | Enterprise | 🔲 Next |

---

## Plans

| | Free | Pro | Enterprise |
|---|---|---|---|
| **Price** | $0 | $9/mo | $6/seat/mo |
| Monitors | Up to 5 | Unlimited | Unlimited |
| Check interval | 5 min | 30 sec | 30 sec |
| SSH connections | 1 | Unlimited | Unlimited |
| Credential vaults | 1 | 3 | Up to 10 |
| Notification channels | 11 free channels | All 16 | All 16 |
| SSH Terminal, File Manager, Log Viewer | — | ✓ | ✓ |
| Agent metrics, Docker manager | — | ✓ | ✓ |
| Status page, Alert rules, Web Viewer | — | ✓ | ✓ |
| Team workspaces | — | — | ✓ |
| Shared connections & monitors | — | — | ✓ |
| RBAC + audit logs | — | — | ✓ |

---

## Notification channels

You supply your own credentials — MavisX fires to your endpoint, never stores tokens server-side.

**Free (11):** Discord, Email/SMTP, Generic Webhook, Telegram, Slack, Microsoft Teams, Pushover, ntfy, Gotify, WhatsApp (Twilio), SMS (Twilio)

**Pro (16):** + PagerDuty, OpsGenie, Signal (signal-cli), Matrix, Rocket.Chat

---

## Tech stack

| Layer | Choice |
|---|---|
| Desktop shell | Tauri v2 (Rust, `stable-x86_64-pc-windows-msvc`) |
| Frontend | React 19 + TypeScript + Vite |
| UI | shadcn/ui + Tailwind v4 + Radix UI |
| Routing | TanStack Router (file-based, `validateSearch` with zod) |
| Data fetching | TanStack Query + TanStack Table |
| Local database | SQLite via `tauri-plugin-sql` (JS) + `sqlx 0.8` (Rust engine) |
| SSH / SFTP | `russh 0.45` + `russh-keys` + `russh-sftp 2.1` — pure Rust, no C deps |
| Terminal UI | `@xterm/xterm` + `@xterm/addon-webgl` + `@xterm/addon-fit` |
| Vault crypto | `aes-gcm 0.10` + `argon2 0.5` — AES-256-GCM + Argon2id per vault |
| HTTP checks | `reqwest 0.12` (rustls, no OpenSSL) |
| DNS checks | `hickory-resolver 0.24` |
| SSL checks | `tokio-rustls` + `x509-cert 0.2` |
| Notifications | `lettre 0.11` (SMTP) + HTTP POST (all other channels) |
| Charts | Recharts |
| State | Zustand (auth) |

---

## Architecture

```
mavisx-app/
├── src/
│   ├── features/           # One folder per module (monitors, ssh, docker, vault, …)
│   ├── routes/             # TanStack Router file-based routes
│   ├── lib/                # invoke() wrappers: db.ts, ssh.ts, sftp.ts, vault.ts, network.ts
│   └── components/
│       └── layout/
│           └── data/
│               └── sidebar-data.ts   # Nav items — pro: true marks gated features
└── src-tauri/
    ├── src/
    │   ├── lib.rs          # Tauri builder — plugins, managed state, command registration
    │   ├── engine.rs       # Background check engine (10s poll) + heartbeat server (:5758)
    │   ├── commands.rs     # SQLite migration registry + one-shot Tauri commands
    │   ├── ssh.rs          # PTY sessions (Channel<SshMsg>) + exec sessions (log viewer)
    │   ├── sftp.rs         # SFTP file manager (Arc-backed SftpSession)
    │   ├── docker.rs       # Docker CLI over SSH — containers, images, logs
    │   ├── network.rs      # Ping, port scan, DNS, SSL, Wake-on-LAN
    │   ├── vault.rs        # Multi-vault AES-256-GCM — VaultKeys(HashMap<id, key>)
    │   ├── notify.rs       # 16 notification channel implementations
    │   └── tray.rs         # System tray (green/red icon)
    └── migrations/
        ├── 0001_init.sql        # monitors, check_results, incidents, alert_rules, workspace
        ├── 0002_workbench.sql   # vault_items, connections, web_tabs, agents, agent_metrics
        └── 0003_vaults.sql     # vaults table + vault_id on vault_items
supabase/
└── migrations/                  # Cloud workspace tables (Supabase/Postgres)
    ├── 001_profiles.sql         # profiles + plan column + new user trigger
    ├── 002_plan_jwt_hook.sql    # custom_access_token_hook for JWT plan embedding
    ├── 003_workspaces.sql       # workspaces + workspace_members
    ├── 004-005_fix_rls.sql      # RLS recursion fix (private schema SECURITY DEFINER)
    ├── 006_username.sql         # username column on profiles
    ├── 007_invite_activation.sql # activate_my_invites() RPC
    ├── 008_fix_workspaces_select.sql
    └── 009_workspace_data.sql   # workspace_monitors + workspace_connections + RLS
```

> **SQLite migration registration:** All `.sql` files must be manually added to `commands.rs → pub fn migrations()` with the next version number. They are NOT auto-discovered.

The frontend calls Rust via `invoke('command', args)` for request/response and `Channel<T>` for streaming (SSH terminal, log viewer). Local data (personal monitors, connections, vault) lives in SQLite — no cloud required on the free tier. Enterprise workspace data (shared monitors, connections, members) is stored in Supabase.

---

## Getting started

**Requirements:** Rust (`stable-x86_64-pc-windows-msvc`), Node.js 20+, pnpm, MSVC C++ Build Tools

```bash
git clone https://github.com/LTSneaX/MavisX.git
cd MavisX/mavisx-app
pnpm install
pnpm tauri:dev
```

First compile takes 3–5 minutes (Rust cold build). Subsequent starts are fast.

**Build installer:**
```bash
pnpm tauri:build
# Output: src-tauri/target/x86_64-pc-windows-msvc/release/bundle/
#   MavisX_0.1.0_x64_en-US.msi
#   MavisX_0.1.0_x64-setup.exe
```

> Kill any running `mavisx.exe` before building — the linker will fail if the exe is locked.

---

## Roadmap

See [`BLUEPRINT.md`](../BLUEPRINT.md) for the full module specs.

**Immediate next:** Workspace monitor checking engine → Plan gate enforcement → Billing (Lemon Squeezy) → Public launch.

---

## License

[Elastic License 2.0 (ELv2)](LICENSE) — source available, commercial use permitted, managed service / SaaS resale prohibited. Copyright © 2026 LTSneaX.
