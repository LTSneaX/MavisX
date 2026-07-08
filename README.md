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
| Upgrade page (Free / Pro pricing) | — | ✅ |
| Cloud auth (Supabase — accounts, invite flow, JWT plan tokens) | All | ✅ |
| Billing (Lemon Squeezy — Pro checkout + webhook) | Pro | ✅ |
| Plan gate enforcement (`requirePro()` route guards + monitor limits) | Pro | ✅ |

---

## Plans

Pricing is charged through **Lemon Squeezy** (merchant of record). **Free** and **Pro** are both live.

| | Free | Pro |
|---|---|---|
| **Price** | $0 | $9/mo |
| Monitors | Up to 5 | Unlimited |
| Check interval | 5 min | 30 sec |
| SSH connections | 1 | Unlimited |
| Credential vaults | 1 | 3 |
| Notification channels | 11 free channels | All 16 |
| SSH Terminal, File Manager, Log Viewer | — | ✓ |
| Agent metrics, Docker manager | — | ✓ |
| Status page, Alert rules, Web Viewer | — | ✓ |

---

## Notification channels

You supply your own credentials — MavisX fires to your endpoint, never stores tokens server-side.

**Free (11):** Discord, Email/SMTP, Generic Webhook, Telegram, Slack, Microsoft Teams, Pushover, ntfy, Gotify, WhatsApp (Twilio), SMS (Twilio)

**Pro (16):** + PagerDuty, OpsGenie, Signal (signal-cli), Matrix, Rocket.Chat

---

## Monetization & billing

MavisX is monetized through **Lemon Squeezy** as the merchant of record (they handle payment, tax, and invoicing). Two live plans — **Free** and **Pro ($9/mo)**. This is wired end-to-end and confirmed working in Lemon Squeezy **test mode**.

### Auth & entitlement model

Auth is **Supabase Auth** (`src/lib/supabase.ts`) — *not* Clerk. (A stale `VITE_CLERK_PUBLISHABLE_KEY` reference was removed from `.env.example`; do not reintroduce it.)

A user's plan is resolved by `resolvePlan()` in `src/stores/plan-store.ts`:

1. **JWT first** — `parsePlanFromToken()` reads `app_metadata.plan` from the Supabase access token (`'pro'` wins; anything else is `'free'`).
2. **DB fallback** — if the JWT carries no paid plan (e.g. the custom-access-token hook isn't enabled), it falls back to the `profiles.plan` column via a Supabase query.

The resolved plan lives in the Zustand `usePlanStore`. Feature gating hangs off it (`src/lib/plan.ts`):

- `requirePro()` — used in route `beforeLoad` guards (e.g. `/ssh`, `/docker`, `/vault`, `/agents`, `/files`, `/log-viewer`, `/web-viewer`, `/status-page`, `/alerts`); redirects free users to `/upgrade`.
- `FREE_MONITOR_LIMIT = 5` — enforced in `src/features/monitors/index.tsx` (free users are blocked from adding beyond 5).

### Checkout flow

The Upgrade page (`src/features/upgrade/index.tsx`) builds a **Lemon Squeezy hosted checkout** URL from environment values and opens it in the system browser:

```
https://<store-slug>.lemonsqueezy.com/checkout/buy/<pro-variant-id>?checkout[custom][user_id]=<supabase-user-id>&checkout[email]=<email>
```

The signed-in **Supabase user id** is passed as `checkout[custom][user_id]` (email is prefilled when available). That custom key **must** stay exactly `user_id` under `checkout[custom]` — the webhook uses it to map the purchase back to the account. If the store/variant env vars or the user id are missing, checkout is skipped with a toast.

### Webhook

A **Supabase Edge Function** (`supabase/functions/lemon-webhook/index.ts`) receives Lemon Squeezy subscription/order events and updates the account's plan:

1. Reads the **raw body once** and verifies the `X-Signature` header as an HMAC-SHA256 of that raw body, keyed by `LEMON_SIGNING_SECRET` (timing-safe, length-guarded, fail-closed if the secret is unset).
2. Only after a valid signature does it parse the JSON. The event name and subscription **status** come from the signed body (never the unsigned `X-Event-Name` header).
3. Validates `meta.custom_data.user_id` as a real UUID.
4. Derives the target plan from subscription **status** when present (`active`/`on_trial`/`paid` → paid; `cancelled`/`expired`/`past_due`/`unpaid` → free), which makes replays and out-of-order deliveries converge; falls back to an event-name switch for one-shot events like `order_created`.
5. Updates `public.profiles` (`plan` plus Lemon customer/subscription/variant ids) via the `service_role` client, then writes `app_metadata.plan` so the next JWT refresh carries the plan. Unactionable events are acked with `200` so Lemon Squeezy stops retrying.

Paid variants currently all map to `pro` via a `?? 'pro'` fallback (`PLAN_MAP` is intentionally empty); numeric variant IDs get added there as new paid variants are introduced.

### Environment variables

**Public — frontend `.env`** (compiled into the app; safe to expose):

| Var | Purpose |
|---|---|
| `VITE_LEMON_STORE` | Lemon Squeezy store slug, e.g. `<your-store-slug>` |
| `VITE_LEMON_PRO_VARIANT_ID` | Variant UUID for the Pro plan, e.g. `<pro-variant-id>` |

**Secret — Supabase Edge Function secret** (never in the frontend, never committed):

| Var | Purpose |
|---|---|
| `LEMON_SIGNING_SECRET` | Webhook signing secret from Lemon Squeezy; must match the store's webhook config exactly |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Auto-injected into the Edge Function runtime — do not set manually |

> `LEMON_SIGNING_SECRET` is a **secret**. Set it as an Edge Function secret (Supabase Dashboard → Edge Functions → Secrets, or `supabase secrets set`). It must never appear in frontend `.env`, client bundles, or version control.

### Billing / deployment notes

Gotchas that make first-time setup painless:

- **Deploy the Edge Function with JWT verification OFF.** Lemon Squeezy is an unauthenticated caller — its auth is the HMAC `X-Signature`, not a Supabase JWT. With JWT enforcement on, every webhook is rejected before your handler runs. Verify with an unauthenticated `curl` after deploy.
- **The deployed function slug must match the Lemon Squeezy webhook Callback URL** (`.../functions/v1/lemon-webhook`). A mismatch = silent 404s on delivery.
- **`service_role` needs table privileges on `public.profiles`.** If plan updates silently fail, grant them:
  ```sql
  GRANT SELECT, UPDATE ON public.profiles TO service_role;
  ```
- Keep the `LEMON_SIGNING_SECRET` value identical on both sides (Lemon Squeezy webhook settings ↔ Edge Function secret) or every request 401s.

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

The frontend calls Rust via `invoke('command', args)` for request/response and `Channel<T>` for streaming (SSH terminal, log viewer). Local data (personal monitors, connections, vault) lives in SQLite — no cloud required on the free tier.

---

## Getting started

**Requirements:** Rust (`stable-x86_64-pc-windows-msvc`), Node.js 20+, pnpm, MSVC C++ Build Tools

```bash
git clone https://github.com/LTSneaX/MavisX.git
cd MavisX
pnpm install
pnpm tauri:dev
```

First compile takes 3–5 minutes (Rust cold build). Subsequent starts are fast.

**Build installer:**
```bash
pnpm tauri:build
# Output: src-tauri/target/x86_64-pc-windows-msvc/release/bundle/
#   MavisX_0.3.0_x64_en-US.msi
#   MavisX_0.3.0_x64-setup.exe
```

> Kill any running `mavisx.exe` before building — the linker will fail if the exe is locked.

---

## Roadmap

See [`BLUEPRINT.md`](../BLUEPRINT.md) for the full module specs.

**Done:** Lemon Squeezy billing (Free / Pro, test mode) + plan-gate enforcement.
**Immediate next:** Public launch.

---

## Beta testing / reporting issues

MavisX is in beta. If you're testing it, your reports are how it gets better.

- **Bug?** File a [Bug report](https://github.com/LTSneaX/MavisX/issues/new?template=bug_report.yml) — structured form asks for steps to reproduce, OS + app version, and which feature.
- **Idea?** File a [Feature request](https://github.com/LTSneaX/MavisX/issues/new?template=feature_request.yml).
- **Question?** Use [Discussions](https://github.com/LTSneaX/MavisX/discussions) or the [website](https://mavisx.ortzabari.co.il).

See [`.github/CONTRIBUTING.md`](.github/CONTRIBUTING.md) for a short guide on filing a good report. Please redact secrets (passwords, keys, tokens) before pasting logs or screenshots.

---

## License

[Elastic License 2.0 (ELv2)](LICENSE) — source available, commercial use permitted, managed service / SaaS resale prohibited. Copyright © 2026 LTSneaX.
