import { invoke } from '@tauri-apps/api/core'
import { Channel } from '@tauri-apps/api/core'

export interface ContainerInfo {
  id: string
  name: string
  image: string
  status: string
  state: string
  ports: string[]
  created: number
}

export interface ImageInfo {
  id: string
  tags: string[]
  size: number
  created: number
}

export function dockerListContainers(all: boolean): Promise<ContainerInfo[]> {
  return invoke('docker_list_containers', { all })
}

export function dockerStart(id: string): Promise<void> {
  return invoke('docker_start', { id })
}

export function dockerStop(id: string): Promise<void> {
  return invoke('docker_stop', { id })
}

export function dockerRestart(id: string): Promise<void> {
  return invoke('docker_restart', { id })
}

export function dockerRemove(id: string, force: boolean): Promise<void> {
  return invoke('docker_remove', { id, force })
}

export async function dockerLogs(
  id: string,
  tail: number,
  onOutput: (line: string) => void,
): Promise<void> {
  const channel = new Channel<string>()
  channel.onmessage = onOutput
  return invoke('docker_logs', { id, tail, onOutput: channel })
}

export function dockerListImages(): Promise<ImageInfo[]> {
  return invoke('docker_list_images')
}

export function dockerRemoveImage(id: string, force: boolean): Promise<void> {
  return invoke('docker_remove_image', { id, force })
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

export function formatCreated(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString()
}
