use log::{error, info};
use serde::Deserialize;
use sqlx::SqlitePool;

#[derive(Debug, sqlx::FromRow)]
struct AlertRule {
    id: String,
    channel: String,
    config: String,
    threshold: Option<i64>,
}

// ─── Config structs ───────────────────────────────────────────────────────────

#[derive(Deserialize)] struct DiscordConfig    { webhook_url: String }
#[derive(Deserialize)] struct SlackConfig      { webhook_url: String }
#[derive(Deserialize)] struct TeamsConfig      { webhook_url: String }
#[derive(Deserialize)] struct RocketchatConfig { webhook_url: String }

#[derive(Deserialize)]
struct EmailConfig {
    to: String,
    smtp_host: String,
    smtp_port: u16,
    smtp_user: String,
    smtp_pass: String,
}

#[derive(Deserialize)]
struct WebhookConfig { url: String }

#[derive(Deserialize)]
struct TelegramConfig {
    bot_token: String,
    chat_id: String,
}

#[derive(Deserialize)]
struct PushoverConfig {
    app_token: String,
    user_key: String,
}

#[derive(Deserialize)]
struct NtfyConfig {
    topic_url: String,
}

#[derive(Deserialize)]
struct GotifyConfig {
    server_url: String,
    app_token: String,
}

#[derive(Deserialize)]
struct TwilioConfig {
    account_sid: String,
    auth_token: String,
    from_number: String,
    to_number: String,
}

#[derive(Deserialize)]
struct PagerdutyConfig {
    routing_key: String,
}

#[derive(Deserialize)]
struct OpsgenieConfig {
    api_key: String,
}

#[derive(Deserialize)]
struct SignalConfig {
    server_url: String,
    sender: String,
    recipient: String,
}

#[derive(Deserialize)]
struct MatrixConfig {
    homeserver: String,
    access_token: String,
    room_id: String,
}

// ─── Load + dispatch ──────────────────────────────────────────────────────────

async fn load_rules(pool: &SqlitePool, monitor_id: &str, condition: &str) -> Vec<AlertRule> {
    sqlx::query_as(
        "SELECT id, channel, config, threshold FROM alert_rules \
         WHERE enabled = 1 AND condition = ? \
         AND (monitor_id IS NULL OR monitor_id = ?)",
    )
    .bind(condition)
    .bind(monitor_id)
    .fetch_all(pool)
    .await
    .unwrap_or_default()
}

async fn consecutive_down_count(pool: &SqlitePool, monitor_id: &str) -> i64 {
    let recent: Vec<String> = sqlx::query_scalar(
        "SELECT status FROM check_results WHERE monitor_id = ? ORDER BY checked_at DESC LIMIT 20",
    )
    .bind(monitor_id)
    .fetch_all(pool)
    .await
    .unwrap_or_default();
    recent.iter().take_while(|s| s.as_str() == "down").count() as i64
}

pub async fn notify_down(pool: &SqlitePool, monitor_id: &str, target: &str, detail: Option<&str>) {
    let rules = load_rules(pool, monitor_id, "down").await;
    let consecutive = consecutive_down_count(pool, monitor_id).await;
    let title = format!("🔴 {target} is DOWN");
    let body = detail.unwrap_or("Monitor is unreachable").to_string();
    for rule in &rules {
        let required = rule.threshold.unwrap_or(1).max(1);
        if consecutive >= required {
            fire(rule, &title, &body).await;
        }
    }
}

pub async fn notify_degraded(pool: &SqlitePool, monitor_id: &str, target: &str, detail: Option<&str>) {
    let rules = load_rules(pool, monitor_id, "degraded").await;
    let title = format!("🟡 {target} is DEGRADED");
    let body = detail.unwrap_or("Monitor is responding slowly").to_string();
    for rule in &rules {
        fire(rule, &title, &body).await;
    }
}

pub async fn notify_up(pool: &SqlitePool, monitor_id: &str, target: &str) {
    let rules = load_rules(pool, monitor_id, "down").await;
    let title = format!("✅ {target} is back UP");
    let body = "Monitor has recovered.".to_string();
    for rule in &rules {
        fire(rule, &title, &body).await;
    }
}

async fn fire(rule: &AlertRule, title: &str, body: &str) {
    dispatch_channel(&rule.channel, &rule.id, &rule.config, title, body).await;
}

/// Channel-level dispatch shared by both the local (`AlertRule`) and workspace
/// (`fire_ws_rule`) paths. `config` is the full JSON config string for the channel,
/// `rule_id` is used only for log context.
async fn dispatch_channel(channel: &str, rule_id: &str, config: &str, title: &str, body: &str) {
    let r = AlertRule {
        id: rule_id.to_string(),
        channel: channel.to_string(),
        config: config.to_string(),
        threshold: None,
    };
    match channel {
        "discord"    => fire_discord(&r, title, body).await,
        "email"      => fire_email(&r, title, body).await,
        "webhook"    => fire_webhook(&r, title, body).await,
        "telegram"   => fire_telegram(&r, title, body).await,
        "slack"      => fire_slack(&r, title, body).await,
        "teams"      => fire_teams(&r, title, body).await,
        "pushover"   => fire_pushover(&r, title, body).await,
        "ntfy"       => fire_ntfy(&r, title, body).await,
        "gotify"     => fire_gotify(&r, title, body).await,
        "whatsapp"   => fire_twilio(&r, title, body, true).await,
        "sms"        => fire_twilio(&r, title, body, false).await,
        "pagerduty"  => fire_pagerduty(&r, title, body).await,
        "opsgenie"   => fire_opsgenie(&r, title, body).await,
        "signal"     => fire_signal(&r, title, body).await,
        "matrix"     => fire_matrix(&r, title, body).await,
        "rocketchat" => fire_rocketchat(&r, title, body).await,
        ch => error!("[notify] Unknown channel: {ch}"),
    }
}

// ─── Workspace alert rule dispatch (secret resolved client-side) ──────────────

/// The secret JSON key each channel expects. The workspace alert rule stores ONLY
/// non-secret routing in its `config`; the credential lives in the vault and is
/// merged in here under this key right before firing. Channels whose only field is
/// the secret-bearing URL (discord/slack/teams/rocketchat/webhook) inject `webhook_url`/`url`.
fn channel_secret_key(channel: &str) -> Option<&'static str> {
    match channel {
        "discord" | "slack" | "teams" | "rocketchat" => Some("webhook_url"),
        "webhook"   => Some("url"),
        "email"     => Some("smtp_pass"),
        "telegram"  => Some("bot_token"),
        "pushover"  => Some("app_token"),
        "gotify"    => Some("app_token"),
        "whatsapp" | "sms" => Some("auth_token"),
        "pagerduty" => Some("routing_key"),
        "opsgenie"  => Some("api_key"),
        "matrix"    => Some("access_token"),
        // ntfy / signal have no required secret field in their config structs
        "ntfy" | "signal" => None,
        _ => None,
    }
}

/// Fire a workspace alert rule. `config_json` is the NON-SECRET routing config from
/// `workspace_alert_rules.config`; `secret` is the plaintext resolved CLIENT-SIDE via
/// `ws_vault::resolve_secret`. The secret is merged into config under the channel's
/// expected key, never persisted. Returns true on a dispatch attempt being made.
pub async fn fire_ws_rule(
    channel: &str,
    rule_id: &str,
    config_json: &serde_json::Value,
    secret: Option<&str>,
    title: &str,
    body: &str,
) {
    let mut cfg = match config_json {
        serde_json::Value::Object(_) => config_json.clone(),
        _ => serde_json::json!({}),
    };

    if let (Some(key), Some(sec)) = (channel_secret_key(channel), secret) {
        if let serde_json::Value::Object(map) = &mut cfg {
            map.insert(key.to_string(), serde_json::Value::String(sec.to_string()));
        }
    }

    let config_str = cfg.to_string();
    dispatch_channel(channel, rule_id, &config_str, title, body).await;
}

// ─── Channel implementations ──────────────────────────────────────────────────

macro_rules! parse_cfg {
    ($rule:expr, $T:ty) => {
        match serde_json::from_str::<$T>(&$rule.config) {
            Ok(c) => c,
            Err(e) => {
                error!("[notify] Config parse error (rule {}, channel {}): {e}", $rule.id, $rule.channel);
                return;
            }
        }
    };
}

macro_rules! post_json {
    ($client:expr, $url:expr, $payload:expr, $label:literal) => {{
        match $client.post($url).json(&$payload).send().await {
            Ok(r) => info!("[notify] {} fired: {}", $label, r.status()),
            Err(e) => error!("[notify] {} send error: {e}", $label),
        }
    }};
}

async fn fire_discord(rule: &AlertRule, title: &str, body: &str) {
    let cfg = parse_cfg!(rule, DiscordConfig);
    let client = reqwest::Client::new();
    let payload = serde_json::json!({ "content": format!("**{title}**\n{body}") });
    post_json!(client, &cfg.webhook_url, payload, "Discord");
}

async fn fire_slack(rule: &AlertRule, title: &str, body: &str) {
    let cfg = parse_cfg!(rule, SlackConfig);
    let client = reqwest::Client::new();
    let payload = serde_json::json!({ "text": format!("*{title}*\n{body}") });
    post_json!(client, &cfg.webhook_url, payload, "Slack");
}

async fn fire_teams(rule: &AlertRule, title: &str, body: &str) {
    let cfg = parse_cfg!(rule, TeamsConfig);
    let client = reqwest::Client::new();
    let payload = serde_json::json!({ "text": format!("{title}\n{body}") });
    post_json!(client, &cfg.webhook_url, payload, "Teams");
}

async fn fire_rocketchat(rule: &AlertRule, title: &str, body: &str) {
    let cfg = parse_cfg!(rule, RocketchatConfig);
    let client = reqwest::Client::new();
    let payload = serde_json::json!({ "text": format!("*{title}*\n{body}") });
    post_json!(client, &cfg.webhook_url, payload, "Rocket.Chat");
}

async fn fire_webhook(rule: &AlertRule, title: &str, body: &str) {
    let cfg = parse_cfg!(rule, WebhookConfig);
    let client = reqwest::Client::new();
    let payload = serde_json::json!({
        "title": title,
        "body": body,
        "timestamp": chrono::Utc::now().to_rfc3339(),
    });
    post_json!(client, &cfg.url, payload, "Webhook");
}

async fn fire_telegram(rule: &AlertRule, title: &str, body: &str) {
    let cfg = parse_cfg!(rule, TelegramConfig);
    let url = format!("https://api.telegram.org/bot{}/sendMessage", cfg.bot_token);
    let client = reqwest::Client::new();
    let payload = serde_json::json!({
        "chat_id": cfg.chat_id,
        "text": format!("*{title}*\n{body}"),
        "parse_mode": "Markdown",
    });
    post_json!(client, &url, payload, "Telegram");
}

async fn fire_pushover(rule: &AlertRule, title: &str, body: &str) {
    let cfg = parse_cfg!(rule, PushoverConfig);
    let client = reqwest::Client::new();
    let params = [
        ("token",   cfg.app_token.as_str()),
        ("user",    cfg.user_key.as_str()),
        ("title",   title),
        ("message", body),
    ];
    match client.post("https://api.pushover.net/1/messages.json").form(&params).send().await {
        Ok(r) => info!("[notify] Pushover fired: {}", r.status()),
        Err(e) => error!("[notify] Pushover send error: {e}"),
    }
}

async fn fire_ntfy(rule: &AlertRule, title: &str, body: &str) {
    let cfg = parse_cfg!(rule, NtfyConfig);
    let client = reqwest::Client::new();
    match client
        .post(&cfg.topic_url)
        .header("Title", title)
        .body(body.to_string())
        .send()
        .await
    {
        Ok(r) => info!("[notify] ntfy fired: {}", r.status()),
        Err(e) => error!("[notify] ntfy send error: {e}"),
    }
}

async fn fire_gotify(rule: &AlertRule, title: &str, body: &str) {
    let cfg = parse_cfg!(rule, GotifyConfig);
    let url = format!("{}/message?token={}", cfg.server_url.trim_end_matches('/'), cfg.app_token);
    let client = reqwest::Client::new();
    let payload = serde_json::json!({ "title": title, "message": body, "priority": 5 });
    post_json!(client, &url, payload, "Gotify");
}

async fn fire_twilio(rule: &AlertRule, title: &str, body: &str, whatsapp: bool) {
    let cfg = parse_cfg!(rule, TwilioConfig);
    let url = format!(
        "https://api.twilio.com/2010-04-01/Accounts/{}/Messages.json",
        cfg.account_sid
    );
    let prefix = if whatsapp { "whatsapp:" } else { "" };
    let from = format!("{prefix}{}", cfg.from_number);
    let to = format!("{prefix}{}", cfg.to_number);
    let message = format!("{title}\n{body}");
    let params = [("From", from.as_str()), ("To", to.as_str()), ("Body", message.as_str())];
    let client = reqwest::Client::new();
    match client
        .post(&url)
        .basic_auth(&cfg.account_sid, Some(&cfg.auth_token))
        .form(&params)
        .send()
        .await
    {
        Ok(r) => info!("[notify] {} fired: {}", if whatsapp { "WhatsApp" } else { "SMS" }, r.status()),
        Err(e) => error!("[notify] Twilio send error: {e}"),
    }
}

async fn fire_pagerduty(rule: &AlertRule, title: &str, body: &str) {
    let cfg = parse_cfg!(rule, PagerdutyConfig);
    let client = reqwest::Client::new();
    let payload = serde_json::json!({
        "routing_key": cfg.routing_key,
        "event_action": "trigger",
        "payload": {
            "summary": title,
            "source": "mavisx",
            "severity": "critical",
            "custom_details": { "detail": body },
        },
    });
    post_json!(client, "https://events.pagerduty.com/v2/enqueue", payload, "PagerDuty");
}

async fn fire_opsgenie(rule: &AlertRule, title: &str, body: &str) {
    let cfg = parse_cfg!(rule, OpsgenieConfig);
    let client = reqwest::Client::new();
    let payload = serde_json::json!({
        "message": title,
        "description": body,
        "source": "mavisx",
        "priority": "P2",
    });
    match client
        .post("https://api.opsgenie.com/v2/alerts")
        .header("Authorization", format!("GenieKey {}", cfg.api_key))
        .json(&payload)
        .send()
        .await
    {
        Ok(r) => info!("[notify] OpsGenie fired: {}", r.status()),
        Err(e) => error!("[notify] OpsGenie send error: {e}"),
    }
}

async fn fire_signal(rule: &AlertRule, title: &str, body: &str) {
    let cfg = parse_cfg!(rule, SignalConfig);
    let url = format!("{}/v2/send", cfg.server_url.trim_end_matches('/'));
    let client = reqwest::Client::new();
    let payload = serde_json::json!({
        "message": format!("{title}\n{body}"),
        "number": cfg.sender,
        "recipients": [cfg.recipient],
    });
    post_json!(client, &url, payload, "Signal");
}

async fn fire_matrix(rule: &AlertRule, title: &str, body: &str) {
    let cfg = parse_cfg!(rule, MatrixConfig);
    let txn_id = uuid::Uuid::new_v4().to_string();
    let room_id_encoded = cfg.room_id.replace('!', "%21").replace(':', "%3A");
    let url = format!(
        "{}/_matrix/client/v3/rooms/{}/send/m.room.message/{}",
        cfg.homeserver.trim_end_matches('/'),
        room_id_encoded,
        txn_id,
    );
    let client = reqwest::Client::new();
    let payload = serde_json::json!({
        "msgtype": "m.text",
        "body": format!("{title}\n{body}"),
    });
    match client
        .put(&url)
        .header("Authorization", format!("Bearer {}", cfg.access_token))
        .json(&payload)
        .send()
        .await
    {
        Ok(r) => info!("[notify] Matrix fired: {}", r.status()),
        Err(e) => error!("[notify] Matrix send error: {e}"),
    }
}

async fn fire_email(rule: &AlertRule, title: &str, body: &str) {
    use lettre::{
        message::header::ContentType, transport::smtp::authentication::Credentials,
        AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor,
    };

    let cfg = parse_cfg!(rule, EmailConfig);
    let from = format!("MavisX <{}>", cfg.smtp_user);
    let email = match Message::builder()
        .from(from.parse().unwrap_or_else(|_| "mavisx@localhost".parse().unwrap()))
        .to(match cfg.to.parse() {
            Ok(m) => m,
            Err(e) => { error!("[notify] Invalid to address: {e}"); return; }
        })
        .subject(title)
        .header(ContentType::TEXT_PLAIN)
        .body(body.to_string())
    {
        Ok(e) => e,
        Err(e) => { error!("[notify] Email build error: {e}"); return; }
    };

    let creds = Credentials::new(cfg.smtp_user, cfg.smtp_pass);
    let mailer = match AsyncSmtpTransport::<Tokio1Executor>::relay(&cfg.smtp_host) {
        Ok(b) => b.port(cfg.smtp_port).credentials(creds).build(),
        Err(e) => { error!("[notify] SMTP relay error: {e}"); return; }
    };

    match mailer.send(email).await {
        Ok(_) => info!("[notify] Email sent to {}", cfg.to),
        Err(e) => error!("[notify] Email send error: {e}"),
    }
}
