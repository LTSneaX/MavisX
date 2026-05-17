use std::sync::Arc;
use std::time::Duration;

use chrono::Utc;
use log::{error, info};
use sqlx::SqlitePool;
use tauri::{AppHandle, Manager};
use tauri_plugin_notification::NotificationExt;
use tokio::time::sleep;
use uuid::Uuid;

use crate::tray;

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct MonitorRow {
    pub id: String,
    pub monitor_type: String,
    pub target: String,
    pub interval_seconds: i64,
    pub timeout_seconds: i64,
    pub config: Option<String>,
}

pub struct CheckOutcome {
    pub status: &'static str,
    pub response_ms: Option<i64>,
    pub detail: Option<String>,
}

pub async fn connect_db(app: &AppHandle) -> Result<SqlitePool, String> {
    let db_path = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("mavisx.db");
    SqlitePool::connect(&format!("sqlite:{}", db_path.display()))
        .await
        .map_err(|e| e.to_string())
}

pub const HEARTBEAT_PORT: u16 = 5758;

pub fn spawn_heartbeat_server(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
        use tokio::net::TcpListener;

        let listener = match TcpListener::bind(format!("127.0.0.1:{}", HEARTBEAT_PORT)).await {
            Ok(l) => { info!("[heartbeat] Listening on port {}", HEARTBEAT_PORT); l }
            Err(e) => { error!("[heartbeat] Failed to bind port {}: {e}", HEARTBEAT_PORT); return; }
        };

        loop {
            let Ok((mut stream, _)) = listener.accept().await else { continue };
            let app = app.clone();
            tokio::spawn(async move {
                let (reader, mut writer) = stream.split();
                let mut reader = BufReader::new(reader);
                let mut request_line = String::new();
                if reader.read_line(&mut request_line).await.is_err() { return; }

                // Parse: "GET /heartbeat/{monitor_id} HTTP/1.1"
                let monitor_id = request_line
                    .split_whitespace()
                    .nth(1)
                    .and_then(|path| path.strip_prefix("/heartbeat/"))
                    .map(|s| s.to_string());

                let (status, body) = if let Some(id) = monitor_id {
                    match connect_db(&app).await {
                        Ok(pool) => {
                            let now = Utc::now().to_rfc3339();
                            let rid = Uuid::new_v4().to_string();
                            let _ = sqlx::query(
                                "INSERT INTO check_results (id, monitor_id, checked_at, status, detail) VALUES (?, ?, ?, 'up', 'Heartbeat received')",
                            )
                            .bind(&rid).bind(&id).bind(&now)
                            .execute(&pool).await;
                            let _ = sqlx::query(
                                "UPDATE incidents SET status='resolved', resolved_at=? WHERE monitor_id=? AND status='open'",
                            )
                            .bind(&now).bind(&id)
                            .execute(&pool).await;
                            info!("[heartbeat] Received for {id}");
                            ("200 OK", "ok")
                        }
                        Err(_) => ("500 Internal Server Error", "db error"),
                    }
                } else {
                    ("404 Not Found", "not found")
                };

                let response = format!(
                    "HTTP/1.1 {status}\r\nContent-Length: {}\r\nContent-Type: text/plain\r\n\r\n{body}",
                    body.len()
                );
                let _ = writer.write_all(response.as_bytes()).await;
            });
        }
    });
}

pub fn spawn_engine(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        // Give tauri-plugin-sql a moment to finish its own migrations
        sleep(Duration::from_secs(2)).await;

        let db_path = match app.path().app_data_dir() {
            Ok(p) => p.join("mavisx.db"),
            Err(e) => {
                error!("[engine] Cannot resolve app data dir: {e}");
                return;
            }
        };

        let db_url = format!("sqlite:{}", db_path.display());

        let pool = match SqlitePool::connect(&db_url).await {
            Ok(p) => p,
            Err(e) => {
                error!("[engine] Cannot connect to DB: {e}");
                return;
            }
        };

        // WAL mode allows the engine and the JS plugin to write concurrently
        let _ = sqlx::query("PRAGMA journal_mode=WAL").execute(&pool).await;

        info!("[engine] Started — DB at {}", db_path.display());

        loop {
            if let Err(e) = run_cycle(&pool, &app).await {
                error!("[engine] Cycle error: {e}");
            }
            sleep(Duration::from_secs(10)).await;
        }
    });
}

async fn run_cycle(pool: &SqlitePool, app: &AppHandle) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Update tray based on current DB health before running new checks
    let any_down: bool = sqlx::query_scalar(
        r#"SELECT COUNT(*) FROM monitors m WHERE m.enabled = 1
           AND (SELECT status FROM check_results WHERE monitor_id = m.id
                ORDER BY checked_at DESC LIMIT 1) = 'down'"#,
    )
    .fetch_one(pool)
    .await
    .map(|n: i64| n > 0)
    .unwrap_or(false);

    tray::update_tray(app, any_down);

    let plan: String = sqlx::query_scalar("SELECT plan FROM workspace WHERE id = 'local'")
        .fetch_one(pool)
        .await
        .unwrap_or_else(|_| "free".to_string());

    let min_interval: i64 = if plan == "pro" || plan == "enterprise" { 30 } else { 150 };

    let monitors: Vec<MonitorRow> = sqlx::query_as(
        r#"SELECT id, "type" AS monitor_type, target, interval_seconds, timeout_seconds, config
           FROM monitors WHERE enabled = 1"#,
    )
    .fetch_all(pool)
    .await?;

    let now = Utc::now();

    for monitor in monitors {
        let last_check: Option<String> = sqlx::query_scalar(
            "SELECT checked_at FROM check_results WHERE monitor_id = ? ORDER BY checked_at DESC LIMIT 1",
        )
        .bind(&monitor.id)
        .fetch_optional(pool)
        .await?;

        let effective_interval = monitor.interval_seconds.max(min_interval);
        let is_due = match &last_check {
            None => true,
            Some(ts) => match ts.parse::<chrono::DateTime<Utc>>() {
                Ok(last) => (now - last).num_seconds() >= effective_interval,
                Err(_) => true,
            },
        };

        if is_due {
            let pool_clone = pool.clone();
            let app_clone = app.clone();
            let m = monitor.clone();
            tokio::spawn(async move {
                run_check_and_save(m, pool_clone, app_clone).await;
            });
        }
    }

    Ok(())
}

pub async fn run_check_and_save(monitor: MonitorRow, pool: SqlitePool, app: AppHandle) {
    let timeout = Duration::from_secs(monitor.timeout_seconds.max(1) as u64);
    let outcome = dispatch_check(&monitor.monitor_type, &monitor.target, timeout, monitor.config.as_deref()).await;

    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();

    let prev_status: Option<String> = sqlx::query_scalar(
        "SELECT status FROM check_results WHERE monitor_id = ? ORDER BY checked_at DESC LIMIT 1",
    )
    .bind(&monitor.id)
    .fetch_optional(&pool)
    .await
    .unwrap_or(None);

    if let Err(e) = sqlx::query(
        "INSERT INTO check_results (id, monitor_id, checked_at, status, response_ms, detail) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&monitor.id)
    .bind(&now)
    .bind(outcome.status)
    .bind(outcome.response_ms)
    .bind(&outcome.detail)
    .execute(&pool)
    .await
    {
        error!("[engine] write check_result failed: {e}");
        return;
    }

    info!(
        "[engine] {} {} -> {} ({:?}ms)",
        monitor.monitor_type, monitor.target, outcome.status, outcome.response_ms
    );

    let went_down = outcome.status == "down" && prev_status.as_deref() != Some("down");
    let came_up = outcome.status == "up" && prev_status.as_deref() == Some("down");

    if went_down {
        let incident_id = Uuid::new_v4().to_string();
        let _ = sqlx::query(
            "INSERT INTO incidents (id, monitor_id, started_at, status, cause) VALUES (?, ?, ?, 'open', ?)",
        )
        .bind(&incident_id)
        .bind(&monitor.id)
        .bind(&now)
        .bind(&outcome.detail)
        .execute(&pool)
        .await;
        info!("[engine] Incident opened for {}", monitor.id);

        let body = format!(
            "{} is DOWN{}",
            monitor.target,
            outcome.detail.as_deref().map(|d| format!(" — {d}")).unwrap_or_default()
        );
        let _ = app.notification().builder().title("MavisX Alert").body(&body).show();
        crate::notify::notify_down(&pool, &monitor.id, &monitor.target, outcome.detail.as_deref()).await;
    }

    if came_up {
        let _ = sqlx::query(
            "UPDATE incidents SET status = 'resolved', resolved_at = ? WHERE monitor_id = ? AND status = 'open'",
        )
        .bind(&now)
        .bind(&monitor.id)
        .execute(&pool)
        .await;
        info!("[engine] Incident resolved for {}", monitor.id);

        let _ = app
            .notification()
            .builder()
            .title("MavisX")
            .body(&format!("{} is back UP", monitor.target))
            .show();
        crate::notify::notify_up(&pool, &monitor.id, &monitor.target).await;
    }
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

pub async fn dispatch_check(monitor_type: &str, target: &str, timeout: Duration, config: Option<&str>) -> CheckOutcome {
    match monitor_type {
        "http" => check_http(target, timeout, config).await,
        "port" => check_port(target, timeout).await,
        "ping" => check_ping(target, timeout).await,
        "dns" => check_dns(target, timeout).await,
        "ssl" => check_ssl(target, timeout).await,
        "cron" => check_cron(target, timeout).await,
        _ => CheckOutcome {
            status: "down",
            response_ms: None,
            detail: Some(format!("Unknown monitor type: {monitor_type}")),
        },
    }
}

// ─── HTTP ─────────────────────────────────────────────────────────────────────

async fn check_http(target: &str, timeout: Duration, config: Option<&str>) -> CheckOutcome {
    let url = if target.starts_with("http://") || target.starts_with("https://") {
        target.to_owned()
    } else {
        format!("https://{target}")
    };

    // Parse config options
    let cfg: serde_json::Value = config
        .and_then(|c| serde_json::from_str(c).ok())
        .unwrap_or_default();
    let method = cfg["method"].as_str().unwrap_or("GET").to_uppercase();
    let expected_status: Option<u16> = cfg["expected_status"].as_u64().map(|n| n as u16);
    let keyword: Option<&str> = cfg["keyword"].as_str();
    let follow_redirects = cfg["follow_redirects"].as_bool().unwrap_or(true);

    let client = match reqwest::Client::builder()
        .timeout(timeout)
        .redirect(if follow_redirects {
            reqwest::redirect::Policy::limited(10)
        } else {
            reqwest::redirect::Policy::none()
        })
        .build()
    {
        Ok(c) => c,
        Err(e) => return CheckOutcome { status: "down", response_ms: None, detail: Some(e.to_string()) },
    };

    let req = match method.as_str() {
        "HEAD" => client.head(&url),
        "POST" => client.post(&url),
        _      => client.get(&url),
    };

    let start = std::time::Instant::now();
    match req.send().await {
        Ok(resp) => {
            let ms = start.elapsed().as_millis() as i64;
            let code = resp.status();

            // Check status code
            let status_ok = match expected_status {
                Some(expected) => code.as_u16() == expected,
                None => code.is_success(),
            };

            if !status_ok {
                return CheckOutcome {
                    status: "down",
                    response_ms: Some(ms),
                    detail: Some(format!("HTTP {code}")),
                };
            }

            // Check keyword in body (skip for HEAD)
            if let Some(kw) = keyword {
                if method != "HEAD" {
                    let body = resp.text().await.unwrap_or_default();
                    if !body.contains(kw) {
                        return CheckOutcome {
                            status: "down",
                            response_ms: Some(ms),
                            detail: Some(format!("Keyword '{kw}' not found in response")),
                        };
                    }
                }
            }

            CheckOutcome {
                status: "up",
                response_ms: Some(ms),
                detail: Some(code.to_string()),
            }
        }
        Err(e) => {
            let detail = if e.is_timeout() { "Timeout".into() } else { e.to_string() };
            CheckOutcome { status: "down", response_ms: None, detail: Some(detail) }
        }
    }
}

// ─── Port ─────────────────────────────────────────────────────────────────────

async fn check_port(target: &str, timeout: Duration) -> CheckOutcome {
    let start = std::time::Instant::now();
    match tokio::time::timeout(timeout, tokio::net::TcpStream::connect(target)).await {
        Ok(Ok(_)) => CheckOutcome {
            status: "up",
            response_ms: Some(start.elapsed().as_millis() as i64),
            detail: None,
        },
        Ok(Err(e)) => CheckOutcome {
            status: "down",
            response_ms: None,
            detail: Some(e.to_string()),
        },
        Err(_) => CheckOutcome {
            status: "down",
            response_ms: None,
            detail: Some("Timeout".into()),
        },
    }
}

// ─── Ping ─────────────────────────────────────────────────────────────────────

async fn check_ping(target: &str, timeout: Duration) -> CheckOutcome {
    let start = std::time::Instant::now();
    #[cfg(target_os = "windows")]
    let fut = {
        let ms = timeout.as_millis().to_string();
        tokio::process::Command::new("ping")
            .args(["-n", "1", "-w", &ms, target])
            .output()
    };

    #[cfg(not(target_os = "windows"))]
    let fut = {
        let s = timeout.as_secs().to_string();
        tokio::process::Command::new("ping")
            .args(["-c", "1", "-W", &s, target])
            .output()
    };

    match tokio::time::timeout(timeout + Duration::from_secs(2), fut).await {
        Ok(Ok(out)) => {
            let ms = start.elapsed().as_millis() as i64;
            if out.status.success() {
                CheckOutcome {
                    status: "up",
                    response_ms: Some(ms),
                    detail: None,
                }
            } else {
                CheckOutcome {
                    status: "down",
                    response_ms: None,
                    detail: Some("Host unreachable".into()),
                }
            }
        }
        Ok(Err(e)) => CheckOutcome {
            status: "down",
            response_ms: None,
            detail: Some(e.to_string()),
        },
        Err(_) => CheckOutcome {
            status: "down",
            response_ms: None,
            detail: Some("Timeout".into()),
        },
    }
}

// ─── DNS ──────────────────────────────────────────────────────────────────────

async fn check_dns(target: &str, timeout: Duration) -> CheckOutcome {
    use hickory_resolver::config::{ResolverConfig, ResolverOpts};
    use hickory_resolver::TokioAsyncResolver;

    let start = std::time::Instant::now();
    let resolver = TokioAsyncResolver::tokio(ResolverConfig::default(), ResolverOpts::default());

    match tokio::time::timeout(timeout, resolver.lookup_ip(target)).await {
        Ok(Ok(_)) => CheckOutcome {
            status: "up",
            response_ms: Some(start.elapsed().as_millis() as i64),
            detail: None,
        },
        Ok(Err(e)) => CheckOutcome {
            status: "down",
            response_ms: None,
            detail: Some(e.to_string()),
        },
        Err(_) => CheckOutcome {
            status: "down",
            response_ms: None,
            detail: Some("Timeout".into()),
        },
    }
}

// ─── Cron (dead man's switch) ────────────────────────────────────────────────

async fn check_cron(target: &str, _timeout: Duration) -> CheckOutcome {
    // target = "monitor_id:grace_seconds" — the heartbeat receiver writes check_results directly
    // We just report the current state based on the most recent heartbeat record
    // The engine's run_cycle only runs this when the monitor is "due", which uses interval_seconds
    // If we reach here it means no heartbeat arrived within the interval — that's DOWN
    let _ = target;
    CheckOutcome {
        status: "down",
        response_ms: None,
        detail: Some("Heartbeat overdue — cron job did not check in".into()),
    }
}

// ─── SSL ──────────────────────────────────────────────────────────────────────

async fn check_ssl(target: &str, timeout: Duration) -> CheckOutcome {
    use rustls::{ClientConfig, RootCertStore};
    use rustls_pki_types::ServerName;
    use tokio_rustls::TlsConnector;

    let host = target.split(':').next().unwrap_or(target);
    let addr = format!("{host}:443");

    let start = std::time::Instant::now();

    let mut root_store = RootCertStore::empty();
    root_store.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
    let config = Arc::new(
        ClientConfig::builder()
            .with_root_certificates(root_store)
            .with_no_client_auth(),
    );
    let connector = TlsConnector::from(config);

    let stream = match tokio::time::timeout(timeout, tokio::net::TcpStream::connect(&addr)).await {
        Ok(Ok(s)) => s,
        Ok(Err(e)) => {
            return CheckOutcome {
                status: "down",
                response_ms: None,
                detail: Some(e.to_string()),
            }
        }
        Err(_) => {
            return CheckOutcome {
                status: "down",
                response_ms: None,
                detail: Some("Timeout".into()),
            }
        }
    };

    let server_name = match ServerName::try_from(host.to_owned()) {
        Ok(n) => n,
        Err(e) => {
            return CheckOutcome {
                status: "down",
                response_ms: None,
                detail: Some(e.to_string()),
            }
        }
    };

    match tokio::time::timeout(timeout, connector.connect(server_name, stream)).await {
        Ok(Ok(_)) => CheckOutcome {
            status: "up",
            response_ms: Some(start.elapsed().as_millis() as i64),
            detail: Some("TLS OK".into()),
        },
        Ok(Err(e)) => CheckOutcome {
            status: "down",
            response_ms: None,
            detail: Some(format!("TLS: {e}")),
        },
        Err(_) => CheckOutcome {
            status: "down",
            response_ms: None,
            detail: Some("TLS timeout".into()),
        },
    }
}
