use bollard::container::{
    ListContainersOptions, LogsOptions, RemoveContainerOptions, RestartContainerOptions,
    StopContainerOptions,
};
use bollard::image::{ListImagesOptions, RemoveImageOptions};
use bollard::Docker;
use futures::StreamExt;
use serde::Serialize;
use tauri::ipc::Channel;

// ── Types returned to frontend ────────────────────────────────────────────────

#[derive(Debug, Serialize, Clone)]
pub struct ContainerInfo {
    pub id: String,
    pub name: String,
    pub image: String,
    pub status: String,
    pub state: String,
    pub ports: Vec<String>,
    pub created: i64,
}

#[derive(Debug, Serialize, Clone)]
pub struct ImageInfo {
    pub id: String,
    pub tags: Vec<String>,
    pub size: i64,
    pub created: i64,
}

// ── Docker connection helper ───────────────────────────────────────────────────

fn connect() -> Result<Docker, String> {
    Docker::connect_with_local_defaults().map_err(|e| format!("Docker connect failed: {e}"))
}

// ── docker_list_containers ────────────────────────────────────────────────────

#[tauri::command]
pub async fn docker_list_containers(all: bool) -> Result<Vec<ContainerInfo>, String> {
    let docker = connect()?;
    let opts = ListContainersOptions::<String> {
        all,
        ..Default::default()
    };

    let containers = docker
        .list_containers(Some(opts))
        .await
        .map_err(|e| format!("list_containers failed: {e}"))?;

    let result = containers
        .into_iter()
        .map(|c| {
            let name = c
                .names
                .as_deref()
                .and_then(|n| n.first())
                .cloned()
                .unwrap_or_default()
                .trim_start_matches('/')
                .to_string();

            let ports = c
                .ports
                .as_deref()
                .unwrap_or(&[])
                .iter()
                .filter_map(|p| {
                    let private = p.private_port;
                    let ip = p.ip.as_deref().unwrap_or("0.0.0.0");
                    if let Some(pub_port) = p.public_port {
                        Some(format!("{}:{}->{}", ip, pub_port, private))
                    } else {
                        None
                    }
                })
                .collect();

            ContainerInfo {
                id: c.id.unwrap_or_default(),
                name,
                image: c.image.unwrap_or_default(),
                status: c.status.unwrap_or_default(),
                state: c.state.unwrap_or_default(),
                ports,
                created: c.created.unwrap_or(0),
            }
        })
        .collect();

    Ok(result)
}

// ── docker_start ──────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn docker_start(id: String) -> Result<(), String> {
    let docker = connect()?;
    docker
        .start_container::<String>(&id, None)
        .await
        .map_err(|e| format!("start failed: {e}"))
}

// ── docker_stop ───────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn docker_stop(id: String) -> Result<(), String> {
    let docker = connect()?;
    docker
        .stop_container(&id, Some(StopContainerOptions { t: 10 }))
        .await
        .map_err(|e| format!("stop failed: {e}"))
}

// ── docker_restart ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn docker_restart(id: String) -> Result<(), String> {
    let docker = connect()?;
    docker
        .restart_container(&id, Some(RestartContainerOptions { t: 10 }))
        .await
        .map_err(|e| format!("restart failed: {e}"))
}

// ── docker_remove ─────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn docker_remove(id: String, force: bool) -> Result<(), String> {
    let docker = connect()?;
    docker
        .remove_container(
            &id,
            Some(RemoveContainerOptions {
                force,
                ..Default::default()
            }),
        )
        .await
        .map_err(|e| format!("remove failed: {e}"))
}

// ── docker_logs — streams last N lines then exits ─────────────────────────────

#[tauri::command]
pub async fn docker_logs(
    id: String,
    tail: u32,
    on_output: Channel<String>,
) -> Result<(), String> {
    let docker = connect()?;
    let opts = LogsOptions::<String> {
        stdout: true,
        stderr: true,
        tail: tail.to_string(),
        timestamps: false,
        follow: false,
        ..Default::default()
    };

    let mut stream = docker.logs(&id, Some(opts));
    while let Some(msg) = stream.next().await {
        match msg {
            Ok(output) => {
                let _ = on_output.send(output.to_string());
            }
            Err(e) => {
                let _ = on_output.send(format!("[error] {e}"));
                break;
            }
        }
    }

    Ok(())
}

// ── docker_list_images ────────────────────────────────────────────────────────

#[tauri::command]
pub async fn docker_list_images() -> Result<Vec<ImageInfo>, String> {
    let docker = connect()?;
    let opts = ListImagesOptions::<String> {
        all: false,
        ..Default::default()
    };

    let images = docker
        .list_images(Some(opts))
        .await
        .map_err(|e| format!("list_images failed: {e}"))?;

    let result = images
        .into_iter()
        .map(|img| ImageInfo {
            id: img.id,
            tags: img.repo_tags,
            size: img.size,
            created: img.created,
        })
        .collect();

    Ok(result)
}

// ── docker_remove_image ───────────────────────────────────────────────────────

#[tauri::command]
pub async fn docker_remove_image(id: String, force: bool) -> Result<(), String> {
    let docker = connect()?;
    docker
        .remove_image(
            &id,
            Some(RemoveImageOptions {
                force,
                ..Default::default()
            }),
            None,
        )
        .await
        .map_err(|e| format!("remove_image failed: {e}"))?;
    Ok(())
}
