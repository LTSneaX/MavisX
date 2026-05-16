use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Key, Nonce,
};
use argon2::{Argon2, Params, Version};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use rand::{rngs::OsRng, RngCore};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;

use crate::engine;

pub struct VaultKey(pub Mutex<Option<[u8; 32]>>);

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VaultItemMeta {
    pub id: String,
    pub name: String,
    pub r#type: String,
    pub used_by: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

fn gen_salt() -> [u8; 16] {
    let mut salt = [0u8; 16];
    OsRng.fill_bytes(&mut salt);
    salt
}

fn gen_nonce() -> [u8; 12] {
    let mut nonce = [0u8; 12];
    OsRng.fill_bytes(&mut nonce);
    nonce
}

fn derive_key(password: &str, salt: &[u8]) -> Result<[u8; 32], String> {
    let params = Params::new(65536, 3, 1, Some(32)).map_err(|e| e.to_string())?;
    let argon2 = Argon2::new(argon2::Algorithm::Argon2id, Version::V0x13, params);
    let mut key = [0u8; 32];
    argon2
        .hash_password_into(password.as_bytes(), salt, &mut key)
        .map_err(|e| e.to_string())?;
    Ok(key)
}

pub fn encrypt_with_key(key: &[u8; 32], plaintext: &str) -> Result<(String, String), String> {
    let nonce_bytes = gen_nonce();
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|e| e.to_string())?;
    Ok((STANDARD.encode(&ciphertext), STANDARD.encode(&nonce_bytes)))
}

pub fn decrypt_with_key(key: &[u8; 32], ciphertext_b64: &str, nonce_b64: &str) -> Result<String, String> {
    let ciphertext = STANDARD.decode(ciphertext_b64).map_err(|e| e.to_string())?;
    let nonce_bytes = STANDARD.decode(nonce_b64).map_err(|e| e.to_string())?;
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let nonce = Nonce::from_slice(&nonce_bytes);
    let plaintext = cipher
        .decrypt(nonce, ciphertext.as_slice())
        .map_err(|_| "Decryption failed — wrong password or corrupted data".to_string())?;
    String::from_utf8(plaintext).map_err(|e| e.to_string())
}

// ─── Commands ────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn vault_is_setup(app: tauri::AppHandle) -> Result<bool, String> {
    let pool = engine::connect_db(&app).await?;
    let config: Option<String> = sqlx::query_scalar("SELECT config FROM workspace WHERE id = 'local'")
        .fetch_optional(&pool)
        .await
        .map_err(|e| e.to_string())?
        .flatten();
    if let Some(cfg) = config {
        let v: serde_json::Value = serde_json::from_str(&cfg).unwrap_or_default();
        Ok(v.get("vault_salt").is_some())
    } else {
        Ok(false)
    }
}

#[tauri::command]
pub fn vault_is_unlocked(vault_key: tauri::State<'_, VaultKey>) -> bool {
    vault_key.0.lock().unwrap().is_some()
}

#[tauri::command]
pub async fn vault_setup(
    app: tauri::AppHandle,
    vault_key: tauri::State<'_, VaultKey>,
    password: String,
) -> Result<(), String> {
    let pool = engine::connect_db(&app).await?;

    let salt = gen_salt();
    let salt_b64 = STANDARD.encode(&salt);
    let key = derive_key(&password, &salt)?;
    let (verifier, verifier_nonce) = encrypt_with_key(&key, "mavisx-vault-v1")?;

    let config_str: Option<String> = sqlx::query_scalar(
        "SELECT config FROM workspace WHERE id = 'local'",
    )
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?
    .flatten();

    let mut config: serde_json::Value = config_str
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(serde_json::json!({}));

    config["vault_salt"] = serde_json::json!(salt_b64);
    config["vault_verifier"] = serde_json::json!(verifier);
    config["vault_verifier_nonce"] = serde_json::json!(verifier_nonce);

    sqlx::query("UPDATE workspace SET config = ? WHERE id = 'local'")
        .bind(config.to_string())
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    *vault_key.0.lock().unwrap() = Some(key);
    Ok(())
}

#[tauri::command]
pub async fn vault_unlock(
    app: tauri::AppHandle,
    vault_key: tauri::State<'_, VaultKey>,
    password: String,
) -> Result<bool, String> {
    let pool = engine::connect_db(&app).await?;

    let config_str: Option<String> = sqlx::query_scalar(
        "SELECT config FROM workspace WHERE id = 'local'",
    )
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?
    .flatten();

    let config: serde_json::Value = config_str
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();

    let salt_b64 = config["vault_salt"].as_str().ok_or("Vault not set up")?;
    let verifier = config["vault_verifier"].as_str().ok_or("Vault not set up")?;
    let verifier_nonce = config["vault_verifier_nonce"].as_str().ok_or("Vault not set up")?;

    let salt = STANDARD.decode(salt_b64).map_err(|e| e.to_string())?;
    let key = derive_key(&password, &salt)?;

    match decrypt_with_key(&key, verifier, verifier_nonce) {
        Ok(s) if s == "mavisx-vault-v1" => {
            *vault_key.0.lock().unwrap() = Some(key);
            Ok(true)
        }
        _ => Ok(false),
    }
}

#[tauri::command]
pub fn vault_lock(vault_key: tauri::State<'_, VaultKey>) -> Result<(), String> {
    *vault_key.0.lock().unwrap() = None;
    Ok(())
}

#[tauri::command]
pub async fn vault_list_items(app: tauri::AppHandle) -> Result<Vec<VaultItemMeta>, String> {
    let pool = engine::connect_db(&app).await?;

    #[derive(sqlx::FromRow)]
    struct Row {
        id: String,
        name: String,
        #[sqlx(rename = "type")]
        item_type: String,
        used_by: Option<String>,
        created_at: String,
        updated_at: String,
    }

    let rows: Vec<Row> = sqlx::query_as(
        r#"SELECT id, name, "type", used_by, created_at, updated_at
           FROM vault_items ORDER BY name COLLATE NOCASE"#,
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows
        .into_iter()
        .map(|r| VaultItemMeta {
            id: r.id,
            name: r.name,
            r#type: r.item_type,
            used_by: r.used_by,
            created_at: r.created_at,
            updated_at: r.updated_at,
        })
        .collect())
}

#[tauri::command]
pub async fn vault_create_item(
    app: tauri::AppHandle,
    vault_key: tauri::State<'_, VaultKey>,
    name: String,
    item_type: String,
    value: String,
) -> Result<VaultItemMeta, String> {
    let key = {
        let guard = vault_key.0.lock().unwrap();
        guard.ok_or("Vault is locked. Unlock it before storing credentials.")?
    };

    let pool = engine::connect_db(&app).await?;
    let (encrypted_value, nonce) = encrypt_with_key(&key, &value)?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    sqlx::query(
        "INSERT INTO vault_items (id, name, type, encrypted_value, nonce, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&name)
    .bind(&item_type)
    .bind(&encrypted_value)
    .bind(&nonce)
    .bind(&now)
    .bind(&now)
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(VaultItemMeta {
        id,
        name,
        r#type: item_type,
        used_by: None,
        created_at: now.clone(),
        updated_at: now,
    })
}

#[tauri::command]
pub async fn vault_update_item(
    app: tauri::AppHandle,
    vault_key: tauri::State<'_, VaultKey>,
    id: String,
    name: Option<String>,
    item_type: Option<String>,
    value: Option<String>,
) -> Result<(), String> {
    let pool = engine::connect_db(&app).await?;
    let now = chrono::Utc::now().to_rfc3339();

    if let Some(val) = value {
        let key = {
            let guard = vault_key.0.lock().unwrap();
            guard.ok_or("Vault is locked.")?
        };
        let (encrypted_value, nonce) = encrypt_with_key(&key, &val)?;
        sqlx::query(
            r#"UPDATE vault_items
               SET name = COALESCE(?, name),
                   "type" = COALESCE(?, "type"),
                   encrypted_value = ?,
                   nonce = ?,
                   updated_at = ?
               WHERE id = ?"#,
        )
        .bind(&name)
        .bind(&item_type)
        .bind(&encrypted_value)
        .bind(&nonce)
        .bind(&now)
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    } else {
        sqlx::query(
            r#"UPDATE vault_items
               SET name = COALESCE(?, name),
                   "type" = COALESCE(?, "type"),
                   updated_at = ?
               WHERE id = ?"#,
        )
        .bind(&name)
        .bind(&item_type)
        .bind(&now)
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub async fn vault_delete_item(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let pool = engine::connect_db(&app).await?;
    sqlx::query("DELETE FROM vault_items WHERE id = ?")
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn vault_get_secret(
    app: tauri::AppHandle,
    vault_key: tauri::State<'_, VaultKey>,
    id: String,
) -> Result<String, String> {
    let key = {
        let guard = vault_key.0.lock().unwrap();
        guard.ok_or("Vault is locked.")?
    };

    let pool = engine::connect_db(&app).await?;

    let row: Option<(String, String)> =
        sqlx::query_as("SELECT encrypted_value, nonce FROM vault_items WHERE id = ?")
            .bind(&id)
            .fetch_optional(&pool)
            .await
            .map_err(|e| e.to_string())?;

    let (encrypted_value, nonce) = row.ok_or("Vault item not found")?;
    decrypt_with_key(&key, &encrypted_value, &nonce)
}
