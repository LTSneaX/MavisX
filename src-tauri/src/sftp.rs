use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use async_trait::async_trait;
use russh::client;
use russh_keys::key::PublicKey;
use russh_sftp::client::SftpSession;
use serde::Serialize;
use uuid::Uuid;

use crate::ssh::SshAuth;

const MAX_FILE_BYTES: u64 = 50 * 1024 * 1024; // 50 MB

// ── Directory entry returned to frontend ─────────────────────────────────────

#[derive(Debug, Serialize, Clone)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: Option<String>,
    pub permissions: Option<String>,
}

// ── Minimal russh client handler for SFTP ────────────────────────────────────

struct SftpClientHandler;

#[async_trait]
impl client::Handler for SftpClientHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &PublicKey,
    ) -> Result<bool, Self::Error> {
        Ok(true)
    }
}

// ── Per-session state ─────────────────────────────────────────────────────────
// SftpSession uses Arc<RawSftpSession> internally — all methods take &self,
// so no inner mutex is needed. We just store it behind Arc<SftpHandle>.

pub struct SftpHandle {
    pub sftp: SftpSession,
    // Keeps the underlying SSH connection alive
    pub _client: client::Handle<SftpClientHandler>,
}

pub struct SftpSessions(pub Mutex<HashMap<String, Arc<SftpHandle>>>);

// ── Helpers ───────────────────────────────────────────────────────────────────

fn join_path(base: &str, name: &str) -> String {
    if base.ends_with('/') {
        format!("{}{}", base, name)
    } else {
        format!("{}/{}", base, name)
    }
}

// ── sftp_connect ──────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn sftp_connect(
    host: String,
    port: u16,
    username: String,
    auth: SshAuth,
    sessions: tauri::State<'_, SftpSessions>,
) -> Result<String, String> {
    let config = Arc::new(client::Config::default());

    let mut handle = client::connect(config, (host.as_str(), port), SftpClientHandler)
        .await
        .map_err(|e| format!("Connection failed: {e}"))?;

    let authenticated = match auth {
        SshAuth::Password { password } => handle
            .authenticate_password(username.clone(), password)
            .await
            .map_err(|e| format!("Auth error: {e}"))?,
        SshAuth::Key { private_key_pem } => {
            let key = russh_keys::decode_secret_key(&private_key_pem, None)
                .map_err(|e| format!("Invalid private key: {e}"))?;
            handle
                .authenticate_publickey(username.clone(), Arc::new(key))
                .await
                .map_err(|e| format!("Auth error: {e}"))?
        }
    };

    if !authenticated {
        return Err("Authentication rejected by server".to_string());
    }

    let channel = handle
        .channel_open_session()
        .await
        .map_err(|e| format!("Channel error: {e}"))?;

    channel
        .request_subsystem(true, "sftp")
        .await
        .map_err(|e| format!("SFTP subsystem error: {e}"))?;

    let sftp = SftpSession::new(channel.into_stream())
        .await
        .map_err(|e| format!("SFTP init error: {e}"))?;

    let session_id = Uuid::new_v4().to_string();
    sessions.0.lock().unwrap().insert(
        session_id.clone(),
        Arc::new(SftpHandle { sftp, _client: handle }),
    );

    Ok(session_id)
}

// ── sftp_list_dir ─────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn sftp_list_dir(
    session_id: String,
    path: String,
    sessions: tauri::State<'_, SftpSessions>,
) -> Result<Vec<FileEntry>, String> {
    let handle = {
        let map = sessions.0.lock().unwrap();
        map.get(&session_id)
            .cloned()
            .ok_or_else(|| "Session not found".to_string())?
    };

    // read_dir returns ReadDir which is a sync Iterator (already fetches all entries)
    let read_dir = handle
        .sftp
        .read_dir(&path)
        .await
        .map_err(|e| format!("read_dir failed: {e}"))?;

    let mut result: Vec<FileEntry> = read_dir
        .map(|e| {
            let name = e.file_name();
            let meta = e.metadata();
            let is_dir = meta.is_dir();
            let size = meta.len();
            let modified = meta.modified().ok().map(|t| {
                let dt: chrono::DateTime<chrono::Utc> = t.into();
                dt.format("%Y-%m-%d %H:%M").to_string()
            });
            // FilePermissions implements Display as "rwxr-xr-x"
            let permissions = Some(format!("{}", meta.permissions()));
            FileEntry {
                path: join_path(&path, &name),
                name,
                is_dir,
                size,
                modified,
                permissions,
            }
        })
        .collect();

    // Dirs first, then files, both alphabetical
    result.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then(a.name.cmp(&b.name)));

    Ok(result)
}

// ── sftp_read_file — returns raw bytes (50 MB cap) ───────────────────────────

#[tauri::command]
pub async fn sftp_read_file(
    session_id: String,
    path: String,
    sessions: tauri::State<'_, SftpSessions>,
) -> Result<Vec<u8>, String> {
    let handle = {
        let map = sessions.0.lock().unwrap();
        map.get(&session_id)
            .cloned()
            .ok_or_else(|| "Session not found".to_string())?
    };

    let meta = handle
        .sftp
        .metadata(&path)
        .await
        .map_err(|e| format!("stat failed: {e}"))?;

    if let Some(size) = meta.size {
        if size > MAX_FILE_BYTES {
            return Err(format!("File too large ({} MB). Max 50 MB.", size / 1024 / 1024));
        }
    }

    handle
        .sftp
        .read(&path)
        .await
        .map_err(|e| format!("read failed: {e}"))
}

// ── sftp_write_file — receives raw bytes from frontend ────────────────────────

#[tauri::command]
pub async fn sftp_write_file(
    session_id: String,
    path: String,
    data: Vec<u8>,
    sessions: tauri::State<'_, SftpSessions>,
) -> Result<(), String> {
    let handle = {
        let map = sessions.0.lock().unwrap();
        map.get(&session_id)
            .cloned()
            .ok_or_else(|| "Session not found".to_string())?
    };

    handle
        .sftp
        .write(&path, &data)
        .await
        .map_err(|e| format!("write failed: {e}"))
}

// ── sftp_delete ───────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn sftp_delete(
    session_id: String,
    path: String,
    is_dir: bool,
    sessions: tauri::State<'_, SftpSessions>,
) -> Result<(), String> {
    let handle = {
        let map = sessions.0.lock().unwrap();
        map.get(&session_id)
            .cloned()
            .ok_or_else(|| "Session not found".to_string())?
    };

    if is_dir {
        handle
            .sftp
            .remove_dir(&path)
            .await
            .map_err(|e| format!("rmdir failed: {e}"))
    } else {
        handle
            .sftp
            .remove_file(&path)
            .await
            .map_err(|e| format!("rm failed: {e}"))
    }
}

// ── sftp_mkdir ────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn sftp_mkdir(
    session_id: String,
    path: String,
    sessions: tauri::State<'_, SftpSessions>,
) -> Result<(), String> {
    let handle = {
        let map = sessions.0.lock().unwrap();
        map.get(&session_id)
            .cloned()
            .ok_or_else(|| "Session not found".to_string())?
    };

    handle
        .sftp
        .create_dir(&path)
        .await
        .map_err(|e| format!("mkdir failed: {e}"))
}

// ── sftp_rename ───────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn sftp_rename(
    session_id: String,
    from_path: String,
    to_path: String,
    sessions: tauri::State<'_, SftpSessions>,
) -> Result<(), String> {
    let handle = {
        let map = sessions.0.lock().unwrap();
        map.get(&session_id)
            .cloned()
            .ok_or_else(|| "Session not found".to_string())?
    };

    handle
        .sftp
        .rename(&from_path, &to_path)
        .await
        .map_err(|e| format!("rename failed: {e}"))
}

// ── sftp_disconnect ───────────────────────────────────────────────────────────

#[tauri::command]
pub async fn sftp_disconnect(
    session_id: String,
    sessions: tauri::State<'_, SftpSessions>,
) -> Result<(), String> {
    sessions.0.lock().unwrap().remove(&session_id);
    Ok(())
}
