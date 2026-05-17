import { invoke } from '@tauri-apps/api/core'

export interface FileEntry {
  name: string
  path: string
  is_dir: boolean
  size: number
  modified: string | null
  permissions: string | null
}

export interface SftpConnectParams {
  host: string
  port: number
  username: string
  auth:
    | { method: 'password'; password: string }
    | { method: 'key'; private_key_pem: string }
}

export function sftpConnect(params: SftpConnectParams): Promise<string> {
  return invoke<string>('sftp_connect', {
    host: params.host,
    port: params.port,
    username: params.username,
    auth: params.auth,
  })
}

export function sftpListDir(sessionId: string, path: string): Promise<FileEntry[]> {
  return invoke<FileEntry[]>('sftp_list_dir', { sessionId, path })
}

export function sftpReadFile(sessionId: string, path: string): Promise<number[]> {
  return invoke<number[]>('sftp_read_file', { sessionId, path })
}

export function sftpWriteFile(sessionId: string, path: string, data: number[]): Promise<void> {
  return invoke('sftp_write_file', { sessionId, path, data })
}

export function sftpDelete(sessionId: string, path: string, isDir: boolean): Promise<void> {
  return invoke('sftp_delete', { sessionId, path, isDir })
}

export function sftpMkdir(sessionId: string, path: string): Promise<void> {
  return invoke('sftp_mkdir', { sessionId, path })
}

export function sftpRename(sessionId: string, fromPath: string, toPath: string): Promise<void> {
  return invoke('sftp_rename', { sessionId, fromPath, toPath })
}

export function sftpDisconnect(sessionId: string): Promise<void> {
  return invoke('sftp_disconnect', { sessionId })
}

// Trigger a browser download from raw bytes
export function triggerDownload(bytes: number[], filename: string) {
  const blob = new Blob([new Uint8Array(bytes)])
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
}
