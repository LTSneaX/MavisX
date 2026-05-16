import { invoke, Channel } from '@tauri-apps/api/core'

export type SshEvent =
  | { type: 'data'; data: number[] }
  | { type: 'exit'; code: number }
  | { type: 'error'; message: string }

export type SshAuth =
  | { method: 'password'; password: string }
  | { method: 'key'; private_key_pem: string }

export async function sshConnect(params: {
  host: string
  port: number
  username: string
  auth: SshAuth
  cols: number
  rows: number
  onOutput: (event: SshEvent) => void
}): Promise<string> {
  const channel = new Channel<SshEvent>()
  channel.onmessage = params.onOutput
  return invoke<string>('ssh_connect', {
    host: params.host,
    port: params.port,
    username: params.username,
    auth: params.auth,
    cols: params.cols,
    rows: params.rows,
    onOutput: channel,
  })
}

export async function sshSendInput(sessionId: string, data: Uint8Array): Promise<void> {
  return invoke('ssh_send_input', { sessionId, data: Array.from(data) })
}

export async function sshResize(sessionId: string, cols: number, rows: number): Promise<void> {
  return invoke('ssh_resize', { sessionId, cols, rows })
}

export async function sshDisconnect(sessionId: string): Promise<void> {
  return invoke('ssh_disconnect', { sessionId })
}

export async function sshExec(params: {
  host: string
  port: number
  username: string
  auth: SshAuth
  command: string
  onOutput: (event: SshEvent) => void
}): Promise<string> {
  const channel = new Channel<SshEvent>()
  channel.onmessage = params.onOutput
  return invoke<string>('ssh_exec', {
    host: params.host,
    port: params.port,
    username: params.username,
    auth: params.auth,
    command: params.command,
    onOutput: channel,
  })
}

export async function sshExecStop(sessionId: string): Promise<void> {
  return invoke('ssh_exec_stop', { sessionId })
}
