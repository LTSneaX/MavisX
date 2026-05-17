use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Key, Nonce,
};
use argon2::{Argon2, Params, Version};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use rand::{rngs::OsRng, RngCore};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;

use crate::engine;

// ─── State ────────────────────────────────────────────────────────────────────

/// Maps vault_id → derived AES-256-GCM key (present only when unlocked)
pub struct VaultKeys(pub Mutex<HashMap<String, [u8; 32]>>);

// ─── Types ────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VaultMeta {
    pub id: String,
    pub name: String,
    pub item_count: i64,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VaultItemMeta {
    pub id: String,
    pub name: String,
    pub r#type: String,
    pub used_by: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

// ─── Crypto helpers ───────────────────────────────────────────────────────────

fn gen_salt() -> [u8; 16] {
    let mut b = [0u8; 16]; OsRng.fill_bytes(&mut b); b
}
fn gen_nonce() -> [u8; 12] {
    let mut b = [0u8; 12]; OsRng.fill_bytes(&mut b); b
}

fn derive_key(password: &str, salt: &[u8]) -> Result<[u8; 32], String> {
    let params = Params::new(65536, 3, 1, Some(32)).map_err(|e| e.to_string())?;
    let argon2 = Argon2::new(argon2::Algorithm::Argon2id, Version::V0x13, params);
    let mut key = [0u8; 32];
    argon2.hash_password_into(password.as_bytes(), salt, &mut key).map_err(|e| e.to_string())?;
    Ok(key)
}

pub fn encrypt_with_key(key: &[u8; 32], plaintext: &str) -> Result<(String, String), String> {
    let nonce_bytes = gen_nonce();
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ct = cipher.encrypt(nonce, plaintext.as_bytes()).map_err(|e| e.to_string())?;
    Ok((STANDARD.encode(&ct), STANDARD.encode(&nonce_bytes)))
}

pub fn decrypt_with_key(key: &[u8; 32], ct_b64: &str, nonce_b64: &str) -> Result<String, String> {
    let ct = STANDARD.decode(ct_b64).map_err(|e| e.to_string())?;
    let nonce_bytes = STANDARD.decode(nonce_b64).map_err(|e| e.to_string())?;
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let nonce = Nonce::from_slice(&nonce_bytes);
    let plain = cipher.decrypt(nonce, ct.as_slice())
        .map_err(|_| "Decryption failed — wrong password or corrupted data".to_string())?;
    String::from_utf8(plain).map_err(|e| e.to_string())
}

// ─── Legacy migration helper ──────────────────────────────────────────────────

/// If the old single-vault config exists in workspace.config but no vaults row
/// exists yet, migrate it to a 'default' vault row automatically.
async fn maybe_migrate_legacy_vault(pool: &sqlx::SqlitePool) -> Result<(), String> {
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM vaults")
        .fetch_one(pool).await.map_err(|e| e.to_string())?;

    if count > 0 { return Ok(()); } // already migrated

    let config_str: Option<String> = sqlx::query_scalar(
        "SELECT config FROM workspace WHERE id = 'local'",
    ).fetch_optional(pool).await.map_err(|e| e.to_string())?.flatten();

    if let Some(cfg) = config_str {
        let v: serde_json::Value = serde_json::from_str(&cfg).unwrap_or_default();
        if let (Some(salt), Some(verifier), Some(vn)) = (
            v["vault_salt"].as_str(),
            v["vault_verifier"].as_str(),
            v["vault_verifier_nonce"].as_str(),
        ) {
            let now = chrono::Utc::now().to_rfc3339();
            sqlx::query(
                "INSERT OR IGNORE INTO vaults (id, name, salt, verifier, verifier_nonce, created_at)
                 VALUES ('default', 'Default', ?, ?, ?, ?)",
            )
            .bind(salt).bind(verifier).bind(vn).bind(&now)
            .execute(pool).await.map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

// ─── Vault management commands ────────────────────────────────────────────────

#[tauri::command]
pub async fn vault_list_vaults(app: tauri::AppHandle) -> Result<Vec<VaultMeta>, String> {
    let pool = engine::connect_db(&app).await?;
    maybe_migrate_legacy_vault(&pool).await?;

    #[derive(sqlx::FromRow)]
    struct Row { id: String, name: String, item_count: i64, created_at: String }

    let rows: Vec<Row> = sqlx::query_as(
        r#"SELECT v.id, v.name, COUNT(i.id) AS item_count, v.created_at
           FROM vaults v
           LEFT JOIN vault_items i ON i.vault_id = v.id
           GROUP BY v.id ORDER BY v.created_at"#,
    ).fetch_all(&pool).await.map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|r| VaultMeta {
        id: r.id, name: r.name, item_count: r.item_count, created_at: r.created_at,
    }).collect())
}

#[tauri::command]
pub async fn vault_create_vault(
    app: tauri::AppHandle,
    vault_keys: tauri::State<'_, VaultKeys>,
    name: String,
    password: String,
) -> Result<VaultMeta, String> {
    let pool = engine::connect_db(&app).await?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    let salt = gen_salt();
    let salt_b64 = STANDARD.encode(&salt);
    let key = derive_key(&password, &salt)?;
    let (verifier, verifier_nonce) = encrypt_with_key(&key, "mavisx-vault-v1")?;

    sqlx::query(
        "INSERT INTO vaults (id, name, salt, verifier, verifier_nonce, created_at)
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&id).bind(&name).bind(&salt_b64)
    .bind(&verifier).bind(&verifier_nonce).bind(&now)
    .execute(&pool).await.map_err(|e| e.to_string())?;

    vault_keys.0.lock().unwrap().insert(id.clone(), key);

    Ok(VaultMeta { id, name, item_count: 0, created_at: now })
}

#[tauri::command]
pub async fn vault_delete_vault(
    app: tauri::AppHandle,
    vault_keys: tauri::State<'_, VaultKeys>,
    vault_id: String,
) -> Result<(), String> {
    let pool = engine::connect_db(&app).await?;
    sqlx::query("DELETE FROM vault_items WHERE vault_id = ?")
        .bind(&vault_id).execute(&pool).await.map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM vaults WHERE id = ?")
        .bind(&vault_id).execute(&pool).await.map_err(|e| e.to_string())?;
    vault_keys.0.lock().unwrap().remove(&vault_id);
    Ok(())
}

#[tauri::command]
pub async fn vault_rename_vault(
    app: tauri::AppHandle,
    vault_id: String,
    name: String,
) -> Result<(), String> {
    let pool = engine::connect_db(&app).await?;
    sqlx::query("UPDATE vaults SET name = ? WHERE id = ?")
        .bind(&name).bind(&vault_id)
        .execute(&pool).await.map_err(|e| e.to_string())?;
    Ok(())
}

// ─── Per-vault lock / unlock ──────────────────────────────────────────────────

#[tauri::command]
pub fn vault_is_unlocked(vault_keys: tauri::State<'_, VaultKeys>, vault_id: String) -> bool {
    vault_keys.0.lock().unwrap().contains_key(&vault_id)
}

#[tauri::command]
pub async fn vault_unlock(
    app: tauri::AppHandle,
    vault_keys: tauri::State<'_, VaultKeys>,
    vault_id: String,
    password: String,
) -> Result<bool, String> {
    let pool = engine::connect_db(&app).await?;

    #[derive(sqlx::FromRow)]
    struct Row { salt: String, verifier: String, verifier_nonce: String }

    let row: Option<Row> = sqlx::query_as(
        "SELECT salt, verifier, verifier_nonce FROM vaults WHERE id = ?",
    ).bind(&vault_id).fetch_optional(&pool).await.map_err(|e| e.to_string())?;

    let row = row.ok_or("Vault not found")?;
    let salt = STANDARD.decode(&row.salt).map_err(|e| e.to_string())?;
    let key = derive_key(&password, &salt)?;

    match decrypt_with_key(&key, &row.verifier, &row.verifier_nonce) {
        Ok(s) if s == "mavisx-vault-v1" => {
            vault_keys.0.lock().unwrap().insert(vault_id, key);
            Ok(true)
        }
        _ => Ok(false),
    }
}

#[tauri::command]
pub fn vault_lock(vault_keys: tauri::State<'_, VaultKeys>, vault_id: String) -> Result<(), String> {
    vault_keys.0.lock().unwrap().remove(&vault_id);
    Ok(())
}

// ─── Vault item commands ──────────────────────────────────────────────────────

#[tauri::command]
pub async fn vault_list_items(
    app: tauri::AppHandle,
    vault_id: String,
) -> Result<Vec<VaultItemMeta>, String> {
    let pool = engine::connect_db(&app).await?;

    #[derive(sqlx::FromRow)]
    struct Row {
        id: String, name: String,
        #[sqlx(rename = "type")] item_type: String,
        used_by: Option<String>, created_at: String, updated_at: String,
    }

    let rows: Vec<Row> = sqlx::query_as(
        r#"SELECT id, name, "type", used_by, created_at, updated_at
           FROM vault_items WHERE vault_id = ? ORDER BY name COLLATE NOCASE"#,
    ).bind(&vault_id).fetch_all(&pool).await.map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|r| VaultItemMeta {
        id: r.id, name: r.name, r#type: r.item_type,
        used_by: r.used_by, created_at: r.created_at, updated_at: r.updated_at,
    }).collect())
}

#[tauri::command]
pub async fn vault_create_item(
    app: tauri::AppHandle,
    vault_keys: tauri::State<'_, VaultKeys>,
    vault_id: String,
    name: String,
    item_type: String,
    value: String,
) -> Result<VaultItemMeta, String> {
    let key = {
        let guard = vault_keys.0.lock().unwrap();
        guard.get(&vault_id).copied().ok_or("Vault is locked")?
    };
    let pool = engine::connect_db(&app).await?;
    let (encrypted_value, nonce) = encrypt_with_key(&key, &value)?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    sqlx::query(
        "INSERT INTO vault_items (id, vault_id, name, type, encrypted_value, nonce, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id).bind(&vault_id).bind(&name).bind(&item_type)
    .bind(&encrypted_value).bind(&nonce).bind(&now).bind(&now)
    .execute(&pool).await.map_err(|e| e.to_string())?;

    Ok(VaultItemMeta { id, name, r#type: item_type, used_by: None, created_at: now.clone(), updated_at: now })
}

#[tauri::command]
pub async fn vault_update_item(
    app: tauri::AppHandle,
    vault_keys: tauri::State<'_, VaultKeys>,
    vault_id: String,
    id: String,
    name: Option<String>,
    item_type: Option<String>,
    value: Option<String>,
) -> Result<(), String> {
    let pool = engine::connect_db(&app).await?;
    let now = chrono::Utc::now().to_rfc3339();

    if let Some(val) = value {
        let key = {
            let guard = vault_keys.0.lock().unwrap();
            guard.get(&vault_id).copied().ok_or("Vault is locked")?
        };
        let (encrypted_value, nonce) = encrypt_with_key(&key, &val)?;
        sqlx::query(
            r#"UPDATE vault_items SET name = COALESCE(?, name), "type" = COALESCE(?, "type"),
               encrypted_value = ?, nonce = ?, updated_at = ? WHERE id = ? AND vault_id = ?"#,
        )
        .bind(&name).bind(&item_type).bind(&encrypted_value).bind(&nonce)
        .bind(&now).bind(&id).bind(&vault_id)
        .execute(&pool).await.map_err(|e| e.to_string())?;
    } else {
        sqlx::query(
            r#"UPDATE vault_items SET name = COALESCE(?, name), "type" = COALESCE(?, "type"),
               updated_at = ? WHERE id = ? AND vault_id = ?"#,
        )
        .bind(&name).bind(&item_type).bind(&now).bind(&id).bind(&vault_id)
        .execute(&pool).await.map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn vault_delete_item(
    app: tauri::AppHandle,
    vault_id: String,
    id: String,
) -> Result<(), String> {
    let pool = engine::connect_db(&app).await?;
    sqlx::query("DELETE FROM vault_items WHERE id = ? AND vault_id = ?")
        .bind(&id).bind(&vault_id)
        .execute(&pool).await.map_err(|e| e.to_string())?;
    Ok(())
}

/// Resolve a secret by item ID across all currently-unlocked vaults.
/// Used when callers only know the item ID (e.g. from connections.vault_item_id).
#[tauri::command]
pub async fn vault_get_secret_by_item_id(
    app: tauri::AppHandle,
    vault_keys: tauri::State<'_, VaultKeys>,
    id: String,
) -> Result<String, String> {
    let pool = engine::connect_db(&app).await?;

    let row: Option<(String, String, String)> =
        sqlx::query_as("SELECT vault_id, encrypted_value, nonce FROM vault_items WHERE id = ?")
            .bind(&id)
            .fetch_optional(&pool)
            .await
            .map_err(|e| e.to_string())?;

    let (vault_id, ct, nonce) = row.ok_or("Vault item not found")?;
    let key = {
        let guard = vault_keys.0.lock().unwrap();
        guard.get(&vault_id).copied().ok_or("Vault is locked")?
    };
    decrypt_with_key(&key, &ct, &nonce)
}

#[tauri::command]
pub async fn vault_get_secret(
    app: tauri::AppHandle,
    vault_keys: tauri::State<'_, VaultKeys>,
    vault_id: String,
    id: String,
) -> Result<String, String> {
    let key = {
        let guard = vault_keys.0.lock().unwrap();
        guard.get(&vault_id).copied().ok_or("Vault is locked")?
    };
    let pool = engine::connect_db(&app).await?;
    let row: Option<(String, String)> =
        sqlx::query_as("SELECT encrypted_value, nonce FROM vault_items WHERE id = ? AND vault_id = ?")
            .bind(&id).bind(&vault_id)
            .fetch_optional(&pool).await.map_err(|e| e.to_string())?;
    let (ct, nonce) = row.ok_or("Vault item not found")?;
    decrypt_with_key(&key, &ct, &nonce)
}
