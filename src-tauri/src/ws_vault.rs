use std::collections::HashMap;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::Manager;

use crate::vault::{encrypt_with_key, decrypt_with_key};
use crate::SupabaseState;

// ─── State ────────────────────────────────────────────────────────────────────

/// Maps workspace_id → derived AES-256-GCM key (present only when unlocked)
pub struct WorkspaceVaultKeys(pub Mutex<HashMap<String, [u8; 32]>>);

// ─── API types ────────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct WsVaultStatus {
    pub exists: bool,
    pub unlocked: bool,
}

#[derive(Serialize, Clone)]
pub struct WsVaultItemMeta {
    pub id: String,
    pub name: String,
    pub item_type: String,
    pub created_at: String,
}

#[derive(Deserialize)]
struct VaultRow {
    id: String,
    salt: String,
}

#[derive(Deserialize)]
struct VaultItemRow {
    id: String,
    name: String,
    item_type: String,
    encrypted_value: String,
    nonce: String,
    created_at: String,
}

// ─── Supabase helpers ─────────────────────────────────────────────────────────

fn get_session(app: &tauri::AppHandle) -> Result<crate::SupabaseSession, String> {
    let state = app.state::<SupabaseState>();
    let lock = state.0.lock().unwrap();
    lock.clone().ok_or_else(|| "Not logged in to Supabase".to_string())
}

fn build_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())
}

async fn sb_get(session: &crate::SupabaseSession, path: &str) -> Result<reqwest::Response, String> {
    let client = build_client()?;
    client
        .get(format!("{}/rest/v1/{}", session.url, path))
        .header("apikey", &session.anon_key)
        .header("Authorization", format!("Bearer {}", session.access_token))
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| e.to_string())
}

async fn sb_post(session: &crate::SupabaseSession, path: &str, body: &impl Serialize) -> Result<reqwest::Response, String> {
    let client = build_client()?;
    client
        .post(format!("{}/rest/v1/{}", session.url, path))
        .header("apikey", &session.anon_key)
        .header("Authorization", format!("Bearer {}", session.access_token))
        .header("Content-Type", "application/json")
        .header("Prefer", "return=representation")
        .json(body)
        .send()
        .await
        .map_err(|e| e.to_string())
}

async fn sb_patch(session: &crate::SupabaseSession, path: &str, body: &impl Serialize) -> Result<reqwest::Response, String> {
    let client = build_client()?;
    client
        .patch(format!("{}/rest/v1/{}", session.url, path))
        .header("apikey", &session.anon_key)
        .header("Authorization", format!("Bearer {}", session.access_token))
        .header("Content-Type", "application/json")
        .header("Prefer", "return=minimal")
        .json(body)
        .send()
        .await
        .map_err(|e| e.to_string())
}

async fn sb_delete(session: &crate::SupabaseSession, path: &str) -> Result<reqwest::Response, String> {
    let client = build_client()?;
    client
        .delete(format!("{}/rest/v1/{}", session.url, path))
        .header("apikey", &session.anon_key)
        .header("Authorization", format!("Bearer {}", session.access_token))
        .send()
        .await
        .map_err(|e| e.to_string())
}

// ─── KDF (reuses argon2 from vault.rs) ───────────────────────────────────────

fn derive_key(password: &str, salt_b64: &str) -> Result<[u8; 32], String> {
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    use argon2::{Argon2, Params, Version};

    let salt = STANDARD.decode(salt_b64).map_err(|e| e.to_string())?;
    let params = Params::new(65536, 3, 1, Some(32)).map_err(|e| e.to_string())?;
    let argon2 = Argon2::new(argon2::Algorithm::Argon2id, Version::V0x13, params);
    let mut key = [0u8; 32];
    argon2.hash_password_into(password.as_bytes(), &salt, &mut key).map_err(|e| e.to_string())?;
    Ok(key)
}

fn gen_salt_b64() -> String {
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    use rand::{rngs::OsRng, RngCore};
    let mut b = [0u8; 16];
    OsRng.fill_bytes(&mut b);
    STANDARD.encode(&b)
}

// ─── Public helper used by ssh.rs ─────────────────────────────────────────────

/// Fetch a vault item from Supabase and decrypt it with the workspace key.
/// Returns the plaintext secret. Fails if vault is locked.
pub async fn resolve_secret(
    app: &tauri::AppHandle,
    workspace_id: &str,
    vault_item_id: &str,
) -> Result<String, String> {
    let key = {
        let state = app.state::<WorkspaceVaultKeys>();
        let map = state.0.lock().unwrap();
        map.get(workspace_id).copied().ok_or("Workspace vault is locked — unlock it first")?
    };
    let session = get_session(app)?;
    let resp = sb_get(
        &session,
        &format!("workspace_vault_items?id=eq.{}&workspace_id=eq.{}&select=encrypted_value,nonce", vault_item_id, workspace_id),
    ).await?;
    let rows: Vec<serde_json::Value> = resp.json().await.map_err(|e| e.to_string())?;
    let row = rows.into_iter().next().ok_or("Vault item not found")?;
    let ct = row["encrypted_value"].as_str().ok_or("Missing encrypted_value")?;
    let nonce = row["nonce"].as_str().ok_or("Missing nonce")?;
    decrypt_with_key(&key, ct, nonce)
}

// ─── Commands ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn ws_vault_status(app: tauri::AppHandle, workspace_id: String) -> Result<WsVaultStatus, String> {
    let unlocked = {
        let state = app.state::<WorkspaceVaultKeys>();
        let map = state.0.lock().unwrap();
        map.contains_key(&workspace_id)
    };
    let session = get_session(&app)?;
    let resp = sb_get(&session, &format!("workspace_vaults?workspace_id=eq.{}&select=id", workspace_id)).await?;
    let rows: Vec<serde_json::Value> = resp.json().await.map_err(|e| e.to_string())?;
    Ok(WsVaultStatus { exists: !rows.is_empty(), unlocked })
}

#[tauri::command]
pub async fn ws_vault_create(app: tauri::AppHandle, workspace_id: String, master_password: String) -> Result<(), String> {
    let session = get_session(&app)?;
    let salt = gen_salt_b64();
    let key = derive_key(&master_password, &salt)?;

    #[derive(Serialize)]
    struct Body { workspace_id: String, salt: String }
    let resp = sb_post(&session, "workspace_vaults", &Body { workspace_id: workspace_id.clone(), salt }).await?;
    if !resp.status().is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Failed to create vault: {text}"));
    }

    let state = app.state::<WorkspaceVaultKeys>();
    let mut map = state.0.lock().unwrap();
    map.insert(workspace_id, key);
    Ok(())
}

#[tauri::command]
pub async fn ws_vault_unlock(app: tauri::AppHandle, workspace_id: String, master_password: String) -> Result<(), String> {
    let session = get_session(&app)?;
    let resp = sb_get(&session, &format!("workspace_vaults?workspace_id=eq.{}&select=id,salt", workspace_id)).await?;
    let rows: Vec<VaultRow> = resp.json().await.map_err(|e| e.to_string())?;
    let vault = rows.into_iter().next().ok_or("Vault not set up — ask an admin to create it")?;

    let key = derive_key(&master_password, &vault.salt)?;

    // Verify password against a test item if any exist
    let items_resp = sb_get(&session, &format!("workspace_vault_items?workspace_id=eq.{}&select=encrypted_value,nonce&limit=1", workspace_id)).await?;
    let items: Vec<serde_json::Value> = items_resp.json().await.map_err(|e| e.to_string())?;
    if let Some(item) = items.into_iter().next() {
        let ct = item["encrypted_value"].as_str().unwrap_or("");
        let nonce = item["nonce"].as_str().unwrap_or("");
        decrypt_with_key(&key, ct, nonce).map_err(|_| "Wrong master password".to_string())?;
    }

    let state = app.state::<WorkspaceVaultKeys>();
    let mut map = state.0.lock().unwrap();
    map.insert(workspace_id, key);
    Ok(())
}

#[tauri::command]
pub async fn ws_vault_lock(app: tauri::AppHandle, workspace_id: String) -> Result<(), String> {
    let state = app.state::<WorkspaceVaultKeys>();
    let mut map = state.0.lock().unwrap();
    map.remove(&workspace_id);
    Ok(())
}

#[tauri::command]
pub async fn ws_vault_list(app: tauri::AppHandle, workspace_id: String) -> Result<Vec<WsVaultItemMeta>, String> {
    let session = get_session(&app)?;
    let resp = sb_get(&session, &format!("workspace_vault_items?workspace_id=eq.{}&select=id,name,item_type,created_at&order=created_at.asc", workspace_id)).await?;
    let rows: Vec<VaultItemRow> = resp.json().await.map_err(|e| e.to_string())?;
    Ok(rows.into_iter().map(|r| WsVaultItemMeta {
        id: r.id, name: r.name, item_type: r.item_type, created_at: r.created_at,
    }).collect())
}

#[tauri::command]
pub async fn ws_vault_add(
    app: tauri::AppHandle,
    workspace_id: String,
    name: String,
    item_type: String,
    secret: String,
) -> Result<(), String> {
    let key = {
        let state = app.state::<WorkspaceVaultKeys>();
        let map = state.0.lock().unwrap();
        map.get(&workspace_id).copied().ok_or("Workspace vault is locked")?
    };
    let (ct, nonce) = encrypt_with_key(&key, &secret)?;
    let session = get_session(&app)?;

    #[derive(Serialize)]
    struct Body { workspace_id: String, name: String, item_type: String, encrypted_value: String, nonce: String }
    let resp = sb_post(&session, "workspace_vault_items", &Body {
        workspace_id, name, item_type, encrypted_value: ct, nonce,
    }).await?;
    if !resp.status().is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Failed to add item: {text}"));
    }
    Ok(())
}

#[tauri::command]
pub async fn ws_vault_update(
    app: tauri::AppHandle,
    workspace_id: String,
    item_id: String,
    name: String,
    item_type: String,
    secret: Option<String>,
) -> Result<(), String> {
    let session = get_session(&app)?;

    if let Some(plaintext) = secret {
        let key = {
            let state = app.state::<WorkspaceVaultKeys>();
            let map = state.0.lock().unwrap();
            map.get(&workspace_id).copied().ok_or("Workspace vault is locked")?
        };
        let (ct, nonce) = encrypt_with_key(&key, &plaintext)?;

        #[derive(Serialize)]
        struct Body { name: String, item_type: String, encrypted_value: String, nonce: String, updated_at: String }
        let body = Body { name, item_type, encrypted_value: ct, nonce, updated_at: chrono::Utc::now().to_rfc3339() };
        let resp = sb_patch(&session, &format!("workspace_vault_items?id=eq.{}", item_id), &body).await?;
        if !resp.status().is_success() {
            return Err(format!("Failed to update item: {}", resp.status()));
        }
    } else {
        #[derive(Serialize)]
        struct Body { name: String, item_type: String, updated_at: String }
        let body = Body { name, item_type, updated_at: chrono::Utc::now().to_rfc3339() };
        let resp = sb_patch(&session, &format!("workspace_vault_items?id=eq.{}", item_id), &body).await?;
        if !resp.status().is_success() {
            return Err(format!("Failed to update item: {}", resp.status()));
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn ws_vault_delete(app: tauri::AppHandle, workspace_id: String, item_id: String) -> Result<(), String> {
    let _ = workspace_id;
    let session = get_session(&app)?;
    let resp = sb_delete(&session, &format!("workspace_vault_items?id=eq.{}", item_id)).await?;
    if !resp.status().is_success() {
        return Err(format!("Failed to delete item: {}", resp.status()));
    }
    Ok(())
}

#[tauri::command]
pub async fn ws_vault_get_secret(app: tauri::AppHandle, workspace_id: String, item_id: String) -> Result<String, String> {
    resolve_secret(&app, &workspace_id, &item_id).await
}
