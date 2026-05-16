import { invoke } from '@tauri-apps/api/core'

export interface PingResult {
  host: string
  alive: boolean
  sent: number
  received: number
  loss_percent: number
  min_ms: number | null
  avg_ms: number | null
  max_ms: number | null
  output: string
}

export interface PortResult {
  port: number
  open: boolean
  service: string
}

export interface DnsResult {
  record_type: string
  records: string[]
  query_ms: number
}

export interface SslInfo {
  host: string
  port: number
  subject: string
  issuer: string
  not_before: string
  not_after: string
  days_remaining: number
  san: string[]
  serial: string
}

export function pingHost(host: string, count: number, timeoutMs: number): Promise<PingResult> {
  return invoke('ping_host', { host, count, timeoutMs })
}

export function portScan(host: string, ports: number[], timeoutMs: number): Promise<PortResult[]> {
  return invoke('port_scan', { host, ports, timeoutMs })
}

export function dnsLookup(host: string, recordType: string): Promise<DnsResult> {
  return invoke('dns_lookup', { host, recordType })
}

export function sslInfo(host: string, port: number): Promise<SslInfo> {
  return invoke('ssl_info', { host, port })
}

export function wakeOnLan(mac: string, broadcast?: string): Promise<void> {
  return invoke('wake_on_lan', { mac, broadcast: broadcast ?? null })
}

// Common port presets
export const PORT_PRESETS: Record<string, number[]> = {
  'Common': [21, 22, 23, 25, 53, 80, 110, 143, 443, 445, 3306, 3389, 5432, 5900, 6379, 8080, 8443, 27017],
  'Web': [80, 443, 8080, 8443, 3000, 4000, 5000, 9000],
  'Database': [1433, 1521, 3306, 5432, 6379, 9200, 27017],
  'Infrastructure': [22, 2375, 2376, 9090, 9100, 16443],
}

export const DNS_RECORD_TYPES = ['A', 'AAAA', 'MX', 'CNAME', 'TXT', 'NS', 'SOA', 'PTR']
