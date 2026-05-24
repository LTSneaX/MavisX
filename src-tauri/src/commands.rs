#![allow(dead_code)]
use std::time::Duration;
use serde::{Deserialize, Serialize};
use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};
use crate::engine;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Monitor {
    pub id: String,
    pub name: String,
    pub r#type: String,
    pub target: String,
    pub interval_seconds: i64,
    pub timeout_seconds: i64,
    pub enabled: i64,
    pub config: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateMonitorInput {
    pub name: String,
    pub r#type: String,
    pub target: String,
    pub interval_seconds: Option<i64>,
    pub timeout_seconds: Option<i64>,
    pub config: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateMonitorInput {
    pub id: String,
    pub name: Option<String>,
    pub target: Option<String>,
    pub interval_seconds: Option<i64>,
    pub timeout_seconds: Option<i64>,
    pub enabled: Option<i64>,
    pub config: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CheckResult {
    pub id: String,
    pub monitor_id: String,
    pub checked_at: String,
    pub status: String,
    pub response_ms: Option<i64>,
    pub detail: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Incident {
    pub id: String,
    pub monitor_id: String,
    pub started_at: String,
    pub resolved_at: Option<String>,
    pub status: String,
    pub cause: Option<String>,
}

#[derive(Serialize)]
pub struct CheckSummary {
    pub status: String,
    pub response_ms: Option<i64>,
    pub detail: Option<String>,
}

#[tauri::command]
pub async fn test_monitor(
    monitor_type: String,
    target: String,
    timeout_seconds: i64,
    config: Option<String>,
) -> Result<CheckSummary, String> {
    let outcome = engine::dispatch_check(
        &monitor_type,
        &target,
        Duration::from_secs(timeout_seconds.max(1) as u64),
        config.as_deref(),
    )
    .await;
    Ok(CheckSummary {
        status: outcome.status.to_owned(),
        response_ms: outcome.response_ms,
        detail: outcome.detail,
    })
}

#[tauri::command]
pub async fn check_monitor_now(
    app: tauri::AppHandle,
    monitor_id: String,
) -> Result<CheckSummary, String> {
    let pool = engine::connect_db(&app).await?;
    let monitor: Option<engine::MonitorRow> = sqlx::query_as(
        r#"SELECT id, "type" AS monitor_type, target, interval_seconds, timeout_seconds, config
           FROM monitors WHERE id = ?"#,
    )
    .bind(&monitor_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let monitor = monitor.ok_or_else(|| "Monitor not found".to_string())?;
    let timeout = Duration::from_secs(monitor.timeout_seconds.max(1) as u64);
    let outcome = engine::dispatch_check(&monitor.monitor_type, &monitor.target, timeout, monitor.config.as_deref()).await;
    let summary = CheckSummary {
        status: outcome.status.to_owned(),
        response_ms: outcome.response_ms,
        detail: outcome.detail.clone(),
    };
    engine::run_check_and_save(monitor, pool, app).await;
    Ok(summary)
}

#[tauri::command]
pub async fn check_ws_monitor_now(
    monitor_id: String,
    monitor_type: String,
    target: String,
    timeout_seconds: i64,
    config: Option<String>,
    supabase_url: String,
    anon_key: String,
    access_token: String,
) -> Result<CheckSummary, String> {

    let timeout = std::time::Duration::from_secs(timeout_seconds.max(1) as u64);
    let outcome = engine::dispatch_check(&monitor_type, &target, timeout, config.as_deref()).await;

    #[derive(serde::Serialize)]
    struct RpcArgs {
        p_id: String,
        p_status: String,
        p_last_checked_at: String,
        p_response_ms: Option<i64>,
        p_detail: Option<String>,
    }

    let args = RpcArgs {
        p_id: monitor_id,
        p_status: outcome.status.to_string(),
        p_last_checked_at: chrono::Utc::now().to_rfc3339(),
        p_response_ms: outcome.response_ms,
        p_detail: outcome.detail.clone(),
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    client
        .post(format!("{}/rest/v1/rpc/record_workspace_monitor_result", supabase_url))
        .header("apikey", &anon_key)
        .header("Authorization", format!("Bearer {}", access_token))
        .header("Content-Type", "application/json")
        .json(&args)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    Ok(CheckSummary {
        status: outcome.status.to_owned(),
        response_ms: outcome.response_ms,
        detail: outcome.detail,
    })
}

#[tauri::command]
pub async fn record_heartbeat(app: tauri::AppHandle, monitor_id: String) -> Result<(), String> {
    let pool = engine::connect_db(&app).await?;
    let now = chrono::Utc::now().to_rfc3339();
    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO check_results (id, monitor_id, checked_at, status, response_ms, detail) VALUES (?, ?, ?, 'up', NULL, 'Heartbeat received')",
    )
    .bind(&id)
    .bind(&monitor_id)
    .bind(&now)
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;

    // Resolve any open incident for this monitor
    sqlx::query(
        "UPDATE incidents SET status = 'resolved', resolved_at = ? WHERE monitor_id = ? AND status = 'open'",
    )
    .bind(&now)
    .bind(&monitor_id)
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;

    log::info!("[heartbeat] Received for {}", monitor_id);
    Ok(())
}

#[tauri::command]
pub async fn set_supabase_session(
    app: tauri::AppHandle,
    url: String,
    anon_key: String,
    access_token: String,
) -> Result<(), String> {
    let state = app.state::<crate::SupabaseState>();
    let mut lock = state.0.lock().unwrap();
    if access_token.is_empty() {
        *lock = None;
    } else {
        *lock = Some(crate::SupabaseSession { url, anon_key, access_token });
    }
    Ok(())
}

#[tauri::command]
pub async fn set_workspace_plan(app: tauri::AppHandle, plan: String) -> Result<(), String> {
    let pool = engine::connect_db(&app).await?;
    sqlx::query("UPDATE workspace SET plan = ? WHERE id = 'local'")
        .bind(&plan)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn get_app_data_dir(app: tauri::AppHandle) -> Result<String, String> {
    app.path()
        .app_data_dir()
        .map(|p| p.display().to_string())
        .map_err(|e| e.to_string())
}

// ── Status pages ──────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct StatusPageRow {
    pub id: String,
    pub name: String,
    pub slug: String,
    pub last_generated: Option<String>,
    pub created_at: String,
}

#[tauri::command]
pub async fn list_status_pages(app: tauri::AppHandle) -> Result<Vec<StatusPageRow>, String> {
    let pool = engine::connect_db(&app).await?;
    sqlx::query_as::<_, StatusPageRow>(
        "SELECT id, name, slug, last_generated, created_at FROM status_pages ORDER BY created_at ASC",
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_status_page(app: tauri::AppHandle, name: String) -> Result<StatusPageRow, String> {
    let pool = engine::connect_db(&app).await?;

    let plan: String = sqlx::query_scalar("SELECT plan FROM workspace WHERE id = 'local'")
        .fetch_one(&pool)
        .await
        .unwrap_or_else(|_| "free".to_string());

    let limit: i64 = match plan.as_str() {
        "enterprise" => 5,
        "pro" => 3,
        _ => 1,
    };

    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM status_pages")
        .fetch_one(&pool)
        .await
        .unwrap_or(0);

    if count >= limit {
        return Err(format!("Plan limit reached ({limit} pages on {plan} plan)"));
    }

    let id = uuid::Uuid::new_v4().to_string();
    let slug_base: String = name
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .trim_matches('-')
        .to_string();
    let slug = format!("{}-{}", slug_base, &id[..8]);
    let now = chrono::Utc::now().to_rfc3339();

    sqlx::query("INSERT INTO status_pages (id, name, slug, created_at) VALUES (?, ?, ?, ?)")
        .bind(&id)
        .bind(&name)
        .bind(&slug)
        .bind(&now)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(StatusPageRow { id, name, slug, last_generated: None, created_at: now })
}

#[tauri::command]
pub async fn delete_status_page(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let pool = engine::connect_db(&app).await?;

    let slug: Option<String> = sqlx::query_scalar("SELECT slug FROM status_pages WHERE id = ?")
        .bind(&id)
        .fetch_optional(&pool)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM status_pages WHERE id = ?")
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    if let Some(s) = slug {
        let _ = app.path().app_data_dir().map(|dir| {
            let _ = std::fs::remove_file(dir.join("status-page").join(format!("{s}.html")));
        });
    }

    Ok(())
}

#[tauri::command]
pub async fn generate_status_page(app: tauri::AppHandle, page_id: String) -> Result<String, String> {
    let pool = engine::connect_db(&app).await?;

    let page = sqlx::query_as::<_, StatusPageRow>(
        "SELECT id, name, slug, last_generated, created_at FROM status_pages WHERE id = ?",
    )
    .bind(&page_id)
    .fetch_one(&pool)
    .await
    .map_err(|_| "Status page not found".to_string())?;

    let workspace_name: String = sqlx::query_scalar(
        "SELECT name FROM workspace WHERE id = 'local'",
    )
    .fetch_one(&pool)
    .await
    .unwrap_or_else(|_| "My Workspace".to_string());

    #[derive(sqlx::FromRow)]
    struct MonitorStatus {
        name: String,
        monitor_type: String,
        target: String,
        status: Option<String>,
        last_checked: Option<String>,
    }

    let monitors: Vec<MonitorStatus> = sqlx::query_as(
        r#"SELECT m.name, m."type" AS monitor_type, m.target,
             (SELECT status FROM check_results WHERE monitor_id = m.id ORDER BY checked_at DESC LIMIT 1) AS status,
             (SELECT checked_at FROM check_results WHERE monitor_id = m.id ORDER BY checked_at DESC LIMIT 1) AS last_checked
           FROM monitors m WHERE m.enabled = 1 ORDER BY m.created_at ASC"#,
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let all_up = monitors.iter().all(|m| m.status.as_deref() == Some("up"));
    let any_down = monitors.iter().any(|m| m.status.as_deref() == Some("down"));

    let overall_text = if any_down {
        "Some systems are experiencing issues"
    } else if all_up {
        "All systems operational"
    } else {
        "Checking systems..."
    };
    let overall_color = if any_down { "#ef4444" } else { "#22c55e" };

    let mut rows = String::new();
    for m in &monitors {
        let status = m.status.as_deref().unwrap_or("pending");
        let (dot_color, label) = match status {
            "up" => ("#22c55e", "Operational"),
            "down" => ("#ef4444", "Down"),
            "degraded" => ("#eab308", "Degraded"),
            _ => ("#6b7280", "Checking"),
        };
        let _checked = m.last_checked.as_deref().unwrap_or("—");
        rows.push_str(&format!(
            r#"<div class="row">
  <div class="left">
    <span class="dot" style="background:{dot_color}"></span>
    <div>
      <div class="name">{}</div>
      <div class="meta">{} &middot; {}</div>
    </div>
  </div>
  <span class="badge" style="background:{}22;color:{dot_color}">{label}</span>
</div>"#,
            html_escape(&m.name),
            html_escape(&m.monitor_type.to_uppercase()),
            html_escape(&m.target),
            dot_color,
        ));
    }

    let generated_at = chrono::Utc::now().format("%Y-%m-%d %H:%M UTC").to_string();

    let html = format!(
        r#"<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>{page_name} — Status | {ws_name}</title>
<style>
*{{box-sizing:border-box;margin:0;padding:0}}
body{{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f0f11;color:#e4e4e7;min-height:100vh;padding:40px 20px}}
.wrap{{max-width:680px;margin:0 auto}}
.header{{margin-bottom:40px}}
.site-name{{font-size:1.1rem;font-weight:600;color:#a1a1aa;margin-bottom:16px}}
.overall{{display:flex;align-items:center;gap:12px;padding:20px 24px;border-radius:12px;background:#18181b;border:1px solid #27272a;margin-bottom:8px}}
.page-name{{font-size:1.6rem;font-weight:700;color:#e4e4e7;margin-bottom:16px}}
.overall-dot{{width:14px;height:14px;border-radius:50%;flex-shrink:0;background:{overall_color}}}
.overall-text{{font-size:1.25rem;font-weight:700}}
.generated{{font-size:0.75rem;color:#52525b;margin-bottom:32px}}
.monitors{{display:flex;flex-direction:column;gap:8px}}
.row{{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;background:#18181b;border:1px solid #27272a;border-radius:10px}}
.left{{display:flex;align-items:center;gap:12px}}
.dot{{width:10px;height:10px;border-radius:50%;flex-shrink:0}}
.name{{font-size:0.9rem;font-weight:500}}
.meta{{font-size:0.75rem;color:#71717a;margin-top:2px}}
.badge{{font-size:0.7rem;font-weight:600;padding:3px 9px;border-radius:9999px;text-transform:uppercase;letter-spacing:.04em}}
.footer{{margin-top:40px;text-align:center;font-size:0.75rem;color:#3f3f46}}
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <div class="site-name">{ws_name}</div>
    <div class="page-name">{page_name}</div>
    <div class="overall">
      <div class="overall-dot"></div>
      <div class="overall-text">{overall_text}</div>
    </div>
    <div class="generated">Last updated {generated_at}</div>
  </div>
  <div class="monitors">
    {rows}
  </div>
  <div class="footer">Powered by MavisX</div>
</div>
</body>
</html>"#,
        ws_name = html_escape(&workspace_name),
        page_name = html_escape(&page.name),
        overall_color = overall_color,
        overall_text = overall_text,
        generated_at = generated_at,
        rows = rows,
    );

    let out_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("status-page");
    std::fs::create_dir_all(&out_dir).map_err(|e| e.to_string())?;
    let out_path = out_dir.join(format!("{}.html", page.slug));
    std::fs::write(&out_path, html).map_err(|e| e.to_string())?;

    let now = chrono::Utc::now().to_rfc3339();
    let _ = sqlx::query("UPDATE status_pages SET last_generated = ? WHERE id = ?")
        .bind(&now)
        .bind(&page_id)
        .execute(&pool)
        .await;

    Ok(out_path.to_string_lossy().to_string())
}

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
     .replace('<', "&lt;")
     .replace('>', "&gt;")
     .replace('"', "&quot;")
}

pub fn migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "init",
            sql: include_str!("../migrations/0001_init.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "workbench",
            sql: include_str!("../migrations/0002_workbench.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "vaults",
            sql: include_str!("../migrations/0003_vaults.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "status_pages",
            sql: include_str!("../migrations/0004_status_pages.sql"),
            kind: MigrationKind::Up,
        },
    ]
}
