# MavisX

**"The only app an IT guy needs open."**

A Tauri v2 desktop app replacing Uptime Kuma, Termius, FileZilla, Portainer, Grafana, Royal TSX, and your browser tabs to internal webapps — all in one window. Local-first, no cloud required, free forever for solo use.

---

## What it does

| Module | Tier | Status |
|---|---|---|
| Uptime Monitoring (HTTP, port, ping, DNS, SSL, cron) | Free | ✅ Live |
| Incident tracking + alert rules | Free | ✅ Live |
| 16 notification channels (Discord, Slack, Telegram, email, PagerDuty, etc.) | Free / Pro | ✅ Live |
| Credential Vault (AES-256-GCM + Argon2id) | Free / Pro | ✅ Live |
| Connection Manager (SSH, SFTP, FTP, RDP, VNC, Docker, Web) | Free | ✅ Live |
| SSH Terminal (multi-tab, PTY, xterm.js + WebGL) | Free | ✅ Live |
| Log Viewer (SSH exec, live tail, 10 presets) | Free | ✅ Live |
| Network Toolkit (ping, port scan, DNS, SSL, Wake-on-LAN) | Free | ✅ Live |
| Web Viewer (bookmark internal webapps, favicon support) | Free | ✅ Live |
| Status Page (static HTML export) | Pro | ✅ Live |
| SFTP / FTP File Manager | Free | 🔲 Phase 2 |
| Agent + Server Metrics | Pro | 🔲 Phase 3 |
| Docker Manager | Pro | 🔲 Phase 4 |
| MavisX Cloud (team sync, real auth, self-hostable) | Pro | 🔲 Phase 9 |

---

## Tech stack

| Layer | Choice |
|---|---|
| Desktop shell | Tauri v2 (Rust, `stable-x86_64-pc-windows-msvc`) |
| Frontend | React 19 + TypeScript + Vite |
| UI | shadcn/ui + Tailwind v4 + Radix UI |
| Routing | TanStack Router (file-based) |
| Data fetching | TanStack Query + TanStack Table |
| Local database | SQLite via `tauri-plugin-sql` (JS) + `sqlx 0.8` (Rust engine) |
| SSH | `russh 0.45` + `russh-keys` — pure Rust, no C deps, MSVC clean |
| Terminal UI | `@xterm/xterm` + `@xterm/addon-webgl` + `@xterm/addon-fit` |
| Vault crypto | `aes-gcm 0.10` + `argon2 0.5` — AES-256-GCM + Argon2id |
| HTTP checks | `reqwest 0.12` (rustls, no OpenSSL) |
| DNS checks | `hickory-resolver 0.24` |
| SSL checks | `tokio-rustls` + `x509-cert 0.2` |
| Notifications | `lettre 0.11` (email/SMTP) + HTTP POST (all other channels) |
| State | Zustand (auth + vault) |
| Charts | Recharts |

---

## Architecture

```
mavisx-app/
├── src/                    # React frontend (runs in WebView2)
│   ├── features/           # One folder per app module
│   ├── routes/             # TanStack Router file-based routes
│   ├── lib/                # db.ts, ssh.ts, network.ts, vault.ts — invoke() wrappers
│   └── stores/             # Zustand: auth-store, vault-store
└── src-tauri/
    ├── src/
    │   ├── lib.rs          # Tauri builder — plugins, state, command registration
    │   ├── engine.rs       # Background check engine (10s poll) + heartbeat server (port 5758)
    │   ├── commands.rs     # SQLite migrations + one-shot Tauri commands
    │   ├── ssh.rs          # PTY sessions + exec sessions (log viewer)
    │   ├── network.rs      # Ping, port scan, DNS, SSL, Wake-on-LAN
    │   ├── vault.rs        # AES-256-GCM credential vault
    │   ├── notify.rs       # 16 notification channel implementations
    │   └── tray.rs         # System tray (green/red icon, OS notifications)
    └── migrations/
        ├── 0001_init.sql   # monitors, check_results, incidents, alert_rules, workspace
        └── 0002_workbench.sql  # vault_items, connections, web_tabs, agents, agent_metrics
```

The frontend calls Rust via `invoke('command', args)` for request/response and `Channel<T>` for streaming (SSH terminal, log viewer). All data lives in a local SQLite file — no external services required.

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

---

## Notification channels

MavisX never manages bots, numbers, or accounts — you provide your own credentials and we fire to your endpoint.

**Free:** Discord, Email/SMTP, Webhook, Telegram, Slack, Microsoft Teams, Pushover, ntfy, Gotify, WhatsApp (Twilio), SMS (Twilio)

**Pro:** PagerDuty, OpsGenie, Signal (signal-cli), Matrix, Rocket.Chat

---

## Tiers

**Free** — everything you need solo: all monitoring types, all free notification channels, SSH terminal, log viewer, network toolkit, web viewer, credential vault (implicit), connection manager.

**Pro** — team and power-user features: named credential vault UI, agent/server metrics, Docker manager, hosted status page, MavisX Cloud team sync (up to 50 seats, self-hostable).

---

## Storage

Default: SQLite (local file, zero config). Planned backends per `BLUEPRINT.md`: PostgreSQL, MySQL, Markdown files (Obsidian-compatible), JSON files.

---

## Roadmap

See [`BLUEPRINT.md`](../BLUEPRINT.md) for the full 10-phase build sequence and module specs.
See [`PLAN.md`](../PLAN.md) for current build state and design standards.

---

## License

MIT
