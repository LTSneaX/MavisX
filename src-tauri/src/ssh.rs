use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use async_trait::async_trait;
use russh::client;
use russh_keys::key::{KeyPair, PublicKey};
use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;
use uuid::Uuid;

// ── Event sent to the frontend via Tauri Channel ─────────────────────────────

#[derive(Debug, Serialize, Clone)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum SshEvent {
    Data { data: Vec<u8> },
    Exit { code: u32 },
    Error { message: String },
}

// ── russh client handler ──────────────────────────────────────────────────────

struct ClientHandler {
    on_output: Channel<SshEvent>,
}

#[async_trait]
impl client::Handler for ClientHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &PublicKey,
    ) -> Result<bool, Self::Error> {
        Ok(true) // Phase 2: known_hosts verification
    }

    async fn data(
        &mut self,
        _channel: russh::ChannelId,
        data: &[u8],
        _session: &mut client::Session,
    ) -> Result<(), Self::Error> {
        let _ = self.on_output.send(SshEvent::Data { data: data.to_vec() });
        Ok(())
    }

    async fn extended_data(
        &mut self,
        _channel: russh::ChannelId,
        _ext: u32,
        data: &[u8],
        _session: &mut client::Session,
    ) -> Result<(), Self::Error> {
        let _ = self.on_output.send(SshEvent::Data { data: data.to_vec() });
        Ok(())
    }
}

// ── Per-session message type ──────────────────────────────────────────────────

pub enum SshMsg {
    Input(Vec<u8>),
    Resize { cols: u32, rows: u32 },
}

// ── Session handle stored in state ───────────────────────────────────────────

pub struct SshSessionHandle {
    pub tx: tokio::sync::mpsc::UnboundedSender<SshMsg>,
}

// ── Managed state ─────────────────────────────────────────────────────────────

pub struct SshSessions(pub Mutex<HashMap<String, SshSessionHandle>>);

// ── Exec sessions (log viewer / one-shot commands) ────────────────────────────

pub struct SshExecHandle {
    pub cancel: tokio::sync::oneshot::Sender<()>,
}

pub struct SshExecSessions(pub Mutex<HashMap<String, SshExecHandle>>);

// ── Auth input ────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
#[serde(tag = "method", rename_all = "snake_case")]
pub enum SshAuth {
    Password { password: String },
    Key { private_key_pem: String },
}

// ── Commands ──────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn ssh_connect(
    host: String,
    port: u16,
    username: String,
    auth: SshAuth,
    cols: u32,
    rows: u32,
    on_output: Channel<SshEvent>,
    sessions: tauri::State<'_, SshSessions>,
) -> Result<String, String> {
    let config = Arc::new(client::Config {
        inactivity_timeout: Some(Duration::from_secs(300)),
        keepalive_interval: Some(Duration::from_secs(30)),
        ..Default::default()
    });

    let handler = ClientHandler { on_output: on_output.clone() };

    let mut handle = client::connect(config, (host.as_str(), port), handler)
        .await
        .map_err(|e| format!("Connection failed: {e}"))?;

    let authenticated = match auth {
        SshAuth::Password { password } => handle
            .authenticate_password(username.clone(), password)
            .await
            .map_err(|e| format!("Auth error: {e}"))?,
        SshAuth::Key { private_key_pem } => {
            let key: KeyPair = russh_keys::decode_secret_key(&private_key_pem, None)
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
        .map_err(|e| format!("Channel open failed: {e}"))?;

    channel
        .request_pty(false, "xterm-256color", cols, rows, 0, 0, &[])
        .await
        .map_err(|e| format!("PTY request failed: {e}"))?;

    channel
        .request_shell(false)
        .await
        .map_err(|e| format!("Shell request failed: {e}"))?;

    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<SshMsg>();
    let session_id = Uuid::new_v4().to_string();

    let on_output_clone = on_output.clone();

    // Spawn write-loop task — captures handle to keep connection alive.
    // When SshSessionHandle.tx is dropped (disconnect), rx.recv() returns None → loop ends → connection closes.
    tokio::spawn(async move {
        let _handle = handle;
        while let Some(msg) = rx.recv().await {
            match msg {
                SshMsg::Input(data) => {
                    // &[u8] implements AsyncRead + Unpin
                    if channel.data(&data[..]).await.is_err() {
                        break;
                    }
                }
                SshMsg::Resize { cols, rows } => {
                    let _ = channel.window_change(cols, rows, 0, 0).await;
                }
            }
        }
        let _ = on_output_clone.send(SshEvent::Exit { code: 0 });
    });

    sessions
        .0
        .lock()
        .unwrap()
        .insert(session_id.clone(), SshSessionHandle { tx });

    Ok(session_id)
}

#[tauri::command]
pub async fn ssh_send_input(
    session_id: String,
    data: Vec<u8>,
    sessions: tauri::State<'_, SshSessions>,
) -> Result<(), String> {
    let tx = {
        let map = sessions.0.lock().unwrap();
        map.get(&session_id)
            .map(|s| s.tx.clone())
            .ok_or_else(|| "Session not found".to_string())?
    };
    tx.send(SshMsg::Input(data)).map_err(|_| "Session closed".to_string())
}

#[tauri::command]
pub async fn ssh_resize(
    session_id: String,
    cols: u32,
    rows: u32,
    sessions: tauri::State<'_, SshSessions>,
) -> Result<(), String> {
    let tx = {
        let map = sessions.0.lock().unwrap();
        map.get(&session_id)
            .map(|s| s.tx.clone())
            .ok_or_else(|| "Session not found".to_string())?
    };
    tx.send(SshMsg::Resize { cols, rows }).map_err(|_| "Session closed".to_string())
}

#[tauri::command]
pub async fn ssh_disconnect(
    session_id: String,
    sessions: tauri::State<'_, SshSessions>,
) -> Result<(), String> {
    sessions.0.lock().unwrap().remove(&session_id);
    Ok(())
}

// ── Exec handler — minimal, no data callback (we use channel.wait() instead) ──

struct ExecHandler;

#[async_trait]
impl client::Handler for ExecHandler {
    type Error = russh::Error;
    async fn check_server_key(&mut self, _: &PublicKey) -> Result<bool, Self::Error> {
        Ok(true)
    }
}

// ── ssh_exec — open an exec channel, run command, stream stdout/stderr ─────────

#[tauri::command]
pub async fn ssh_exec(
    host: String,
    port: u16,
    username: String,
    auth: SshAuth,
    command: String,
    on_output: Channel<SshEvent>,
    exec_sessions: tauri::State<'_, SshExecSessions>,
) -> Result<String, String> {
    let config = Arc::new(client::Config {
        inactivity_timeout: Some(Duration::from_secs(3600)),
        ..Default::default()
    });

    let mut handle = client::connect(config, (host.as_str(), port), ExecHandler)
        .await
        .map_err(|e| format!("Connection failed: {e}"))?;

    let authenticated = match auth {
        SshAuth::Password { password } => handle
            .authenticate_password(username, password)
            .await
            .map_err(|e| format!("Auth error: {e}"))?,
        SshAuth::Key { private_key_pem } => {
            let key: KeyPair = russh_keys::decode_secret_key(&private_key_pem, None)
                .map_err(|e| format!("Invalid private key: {e}"))?;
            handle
                .authenticate_publickey(username, Arc::new(key))
                .await
                .map_err(|e| format!("Auth error: {e}"))?
        }
    };

    if !authenticated {
        return Err("Authentication rejected by server".to_string());
    }

    let mut channel = handle
        .channel_open_session()
        .await
        .map_err(|e| format!("Channel open failed: {e}"))?;

    channel
        .exec(false, command.as_str())
        .await
        .map_err(|e| format!("exec failed: {e}"))?;

    let session_id = Uuid::new_v4().to_string();
    let (cancel_tx, mut cancel_rx) = tokio::sync::oneshot::channel::<()>();

    let on_out = on_output.clone();
    tokio::spawn(async move {
        let _handle = handle;
        loop {
            tokio::select! {
                msg = channel.wait() => {
                    match msg {
                        Some(russh::ChannelMsg::Data { ref data }) => {
                            let _ = on_out.send(SshEvent::Data { data: data.to_vec() });
                        }
                        Some(russh::ChannelMsg::ExtendedData { ref data, .. }) => {
                            let _ = on_out.send(SshEvent::Data { data: data.to_vec() });
                        }
                        Some(russh::ChannelMsg::ExitStatus { exit_status }) => {
                            let _ = on_out.send(SshEvent::Exit { code: exit_status });
                            break;
                        }
                        None => {
                            let _ = on_out.send(SshEvent::Exit { code: 0 });
                            break;
                        }
                        _ => {}
                    }
                }
                _ = &mut cancel_rx => {
                    let _ = on_out.send(SshEvent::Exit { code: 0 });
                    break;
                }
            }
        }
    });

    exec_sessions.0.lock().unwrap().insert(session_id.clone(), SshExecHandle { cancel: cancel_tx });
    Ok(session_id)
}

#[tauri::command]
pub async fn ssh_exec_stop(
    session_id: String,
    exec_sessions: tauri::State<'_, SshExecSessions>,
) -> Result<(), String> {
    // Dropping the SshExecHandle fires the cancel_tx → cancel_rx resolves → task exits
    exec_sessions.0.lock().unwrap().remove(&session_id);
    Ok(())
}
