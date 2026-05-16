use std::net::UdpSocket;
use std::time::Duration;

use futures::stream::{FuturesUnordered, StreamExt};
use hickory_resolver::config::*;
use hickory_resolver::proto::rr::RecordType;
use hickory_resolver::TokioAsyncResolver;
use serde::Serialize;
use tokio::io::AsyncWriteExt;
use tokio::net::TcpStream;
use tokio::time::timeout;

// ── Ping ──────────────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct PingResult {
    pub host: String,
    pub alive: bool,
    pub sent: u32,
    pub received: u32,
    pub loss_percent: f64,
    pub min_ms: Option<f64>,
    pub avg_ms: Option<f64>,
    pub max_ms: Option<f64>,
    pub output: String,
}

#[tauri::command]
pub async fn ping_host(
    host: String,
    count: u32,
    timeout_ms: u64,
) -> Result<PingResult, String> {
    let count = count.clamp(1, 50);
    let timeout_ms = timeout_ms.clamp(500, 10_000);

    let raw = if cfg!(target_os = "windows") {
        tokio::process::Command::new("ping")
            .args(["-n", &count.to_string(), "-w", &timeout_ms.to_string(), &host])
            .output()
            .await
            .map_err(|e| format!("ping command failed: {e}"))?
    } else {
        let timeout_sec = (timeout_ms / 1000).max(1);
        tokio::process::Command::new("ping")
            .args(["-c", &count.to_string(), "-W", &timeout_sec.to_string(), &host])
            .output()
            .await
            .map_err(|e| format!("ping command failed: {e}"))?
    };

    let output = String::from_utf8_lossy(&raw.stdout).to_string()
        + &String::from_utf8_lossy(&raw.stderr);

    let received = output
        .lines()
        .filter(|l| {
            let lo = l.to_lowercase();
            lo.contains("reply from") || (lo.contains("bytes from") && lo.contains("time="))
        })
        .count() as u32;

    let (min_ms, avg_ms, max_ms) = parse_ping_rtt(&output);
    let loss_percent = (count.saturating_sub(received) as f64 / count as f64) * 100.0;

    Ok(PingResult {
        host,
        alive: received > 0,
        sent: count,
        received,
        loss_percent,
        min_ms,
        avg_ms,
        max_ms,
        output,
    })
}

fn parse_ping_rtt(output: &str) -> (Option<f64>, Option<f64>, Option<f64>) {
    for line in output.lines() {
        let lower = line.to_lowercase();

        // Linux: "rtt min/avg/max/mdev = 1.2/3.4/5.6/0.8 ms"
        if lower.contains("min/avg/max") && lower.contains('=') {
            if let Some(nums_part) = line.split('=').nth(1) {
                let nums: Vec<f64> = nums_part
                    .trim()
                    .split_whitespace()
                    .next()
                    .unwrap_or("")
                    .split('/')
                    .filter_map(|s| s.parse().ok())
                    .collect();
                if nums.len() >= 3 {
                    return (Some(nums[0]), Some(nums[1]), Some(nums[2]));
                }
            }
        }

        // Windows: "Minimum = 10ms, Maximum = 12ms, Average = 11ms"
        if lower.contains("minimum") && lower.contains("maximum") && lower.contains("average") {
            let min = extract_ms_after(line, "minimum");
            let max = extract_ms_after(line, "maximum");
            let avg = extract_ms_after(line, "average");
            if min.is_some() || avg.is_some() {
                return (min, avg, max);
            }
        }
    }
    (None, None, None)
}

fn extract_ms_after(line: &str, keyword: &str) -> Option<f64> {
    let lower = line.to_lowercase();
    let idx = lower.find(keyword)?;
    let after = &line[idx + keyword.len()..];
    // skip " = " or "="
    let after = after.trim_start_matches(|c: char| c == ' ' || c == '=').trim();
    // parse number (stop at non-numeric/non-dot)
    let num_str: String = after.chars().take_while(|c| c.is_ascii_digit() || *c == '.').collect();
    num_str.parse().ok()
}

// ── Port scan ─────────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct PortResult {
    pub port: u16,
    pub open: bool,
    pub service: String,
}

#[tauri::command]
pub async fn port_scan(
    host: String,
    ports: Vec<u16>,
    timeout_ms: u64,
) -> Result<Vec<PortResult>, String> {
    if ports.len() > 10_000 {
        return Err("Too many ports (max 10 000)".to_string());
    }
    let timeout_dur = Duration::from_millis(timeout_ms.clamp(100, 5_000));

    let mut tasks: FuturesUnordered<_> = ports
        .into_iter()
        .map(|port| {
            let host = host.clone();
            async move {
                let addr = format!("{host}:{port}");
                let open = timeout(timeout_dur, TcpStream::connect(&addr)).await.is_ok_and(|r| r.is_ok());
                PortResult { port, open, service: service_name(port).to_string() }
            }
        })
        .collect();

    let mut results = Vec::new();
    while let Some(r) = tasks.next().await {
        results.push(r);
    }
    results.sort_by_key(|r| r.port);
    Ok(results)
}

fn service_name(port: u16) -> &'static str {
    match port {
        20 => "FTP-data", 21 => "FTP", 22 => "SSH", 23 => "Telnet", 25 => "SMTP",
        53 => "DNS", 67 => "DHCP", 69 => "TFTP", 80 => "HTTP", 110 => "POP3",
        111 => "RPC", 119 => "NNTP", 123 => "NTP", 143 => "IMAP", 161 => "SNMP",
        389 => "LDAP", 443 => "HTTPS", 445 => "SMB", 465 => "SMTPS", 514 => "Syslog",
        587 => "SMTP", 631 => "IPP", 636 => "LDAPS", 993 => "IMAPS", 995 => "POP3S",
        1194 => "OpenVPN", 1433 => "MSSQL", 1521 => "Oracle", 2049 => "NFS",
        2375 => "Docker", 2376 => "Docker-TLS", 3000 => "HTTP-Alt", 3306 => "MySQL",
        3389 => "RDP", 5432 => "PostgreSQL", 5900 => "VNC", 5985 => "WinRM",
        6379 => "Redis", 7001 => "WebLogic", 8080 => "HTTP-Alt", 8443 => "HTTPS-Alt",
        8888 => "HTTP-Alt", 9000 => "HTTP-Alt", 9200 => "Elasticsearch",
        9300 => "Elasticsearch", 10250 => "Kubelet", 27017 => "MongoDB",
        _ => "",
    }
}

// ── DNS lookup ────────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct DnsResult {
    pub record_type: String,
    pub records: Vec<String>,
    pub query_ms: u64,
}

#[tauri::command]
pub async fn dns_lookup(host: String, record_type: String) -> Result<DnsResult, String> {
    let resolver = TokioAsyncResolver::tokio(ResolverConfig::default(), ResolverOpts::default());

    let rtype: RecordType = record_type.parse().map_err(|_| format!("Unknown record type: {record_type}"))?;
    let start = std::time::Instant::now();

    let lookup = resolver
        .lookup(host.as_str(), rtype)
        .await
        .map_err(|e| e.to_string())?;

    let query_ms = start.elapsed().as_millis() as u64;

    let records: Vec<String> = lookup.iter().map(|r| r.to_string()).collect();

    Ok(DnsResult { record_type, records, query_ms })
}

// ── SSL info ──────────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct SslInfo {
    pub host: String,
    pub port: u16,
    pub subject: String,
    pub issuer: String,
    pub not_before: String,
    pub not_after: String,
    pub days_remaining: i64,
    pub san: Vec<String>,
    pub serial: String,
}

#[tauri::command]
pub async fn ssl_info(host: String, port: u16) -> Result<SslInfo, String> {
    use std::sync::Arc;
    use tokio::net::TcpStream;
    use tokio_rustls::rustls::{ClientConfig, RootCertStore};
    use tokio_rustls::TlsConnector;
    use rustls_pki_types::ServerName;

    let mut root_store = RootCertStore::empty();
    root_store.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
    let config = Arc::new(
        ClientConfig::builder()
            .with_root_certificates(root_store)
            .with_no_client_auth(),
    );

    let connector = TlsConnector::from(config);
    let addr = format!("{host}:{port}");
    let stream = timeout(Duration::from_secs(10), TcpStream::connect(&addr))
        .await
        .map_err(|_| "Connection timeout".to_string())?
        .map_err(|e| format!("TCP connect failed: {e}"))?;

    let server_name = ServerName::try_from(host.clone()).map_err(|e| format!("Invalid hostname: {e}"))?;
    let mut tls_stream = connector
        .connect(server_name, stream)
        .await
        .map_err(|e| format!("TLS handshake failed: {e}"))?;

    tls_stream.shutdown().await.ok();

    let (_, session) = tls_stream.get_ref();
    let certs = session.peer_certificates().ok_or("No certificates")?;
    let cert_der = certs.first().ok_or("Empty cert chain")?;

    // Parse with x509-cert (re-exports der)
    use x509_cert::der::Decode;
    use x509_cert::Certificate;
    use x509_cert::ext::pkix::{SubjectAltName, name::GeneralName};

    let cert = Certificate::from_der(cert_der.as_ref()).map_err(|e| format!("Cert parse error: {e}"))?;
    let tbs = &cert.tbs_certificate;

    let subject = tbs.subject.to_string();
    let issuer = tbs.issuer.to_string();
    let not_before = tbs.validity.not_before.to_date_time().to_string();
    let not_after = tbs.validity.not_after.to_date_time().to_string();

    // Days remaining
    let expiry = tbs.validity.not_after.to_system_time();
    let now = std::time::SystemTime::now();
    let days_remaining = expiry.duration_since(now)
        .map(|d| d.as_secs() as i64 / 86_400)
        .unwrap_or(-1);

    // Subject Alternative Names — OID 2.5.29.17
    let san_oid = x509_cert::der::oid::ObjectIdentifier::new_unwrap("2.5.29.17");
    let san: Vec<String> = tbs.extensions.as_ref()
        .map(|exts| {
            exts.iter().filter_map(|ext| {
                if ext.extn_id == san_oid {
                    SubjectAltName::from_der(ext.extn_value.as_bytes()).ok()
                        .map(|s| s.0.iter().filter_map(|n| match n {
                            GeneralName::DnsName(name) => Some(name.as_str().to_string()),
                            GeneralName::IpAddress(ip) => Some(format!("{ip:?}")),
                            _ => None,
                        }).collect::<Vec<_>>())
                } else { None }
            }).flatten().collect()
        })
        .unwrap_or_default();

    // Serial number (hex)
    let serial_bytes = tbs.serial_number.as_bytes();
    let serial = serial_bytes.iter().map(|b| format!("{b:02X}")).collect::<Vec<_>>().join(":");

    Ok(SslInfo { host, port, subject, issuer, not_before, not_after, days_remaining, san, serial })
}

// ── Wake-on-LAN ───────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn wake_on_lan(mac: String, broadcast: Option<String>) -> Result<(), String> {
    // Parse MAC — accept XX:XX:XX:XX:XX:XX or XX-XX-XX-XX-XX-XX
    let clean: String = mac.chars().filter(|c| c.is_ascii_hexdigit()).collect();
    if clean.len() != 12 {
        return Err(format!("Invalid MAC address: {mac}"));
    }
    let mac_bytes: Vec<u8> = (0..6)
        .map(|i| u8::from_str_radix(&clean[i*2..i*2+2], 16).unwrap_or(0))
        .collect();

    // Build magic packet: 6x 0xFF + MAC × 16
    let mut packet = vec![0xFF_u8; 6];
    for _ in 0..16 {
        packet.extend_from_slice(&mac_bytes);
    }

    let broadcast_addr: std::net::Ipv4Addr = broadcast
        .as_deref()
        .unwrap_or("255.255.255.255")
        .parse()
        .map_err(|_| "Invalid broadcast address".to_string())?;

    let socket = UdpSocket::bind("0.0.0.0:0").map_err(|e| e.to_string())?;
    socket.set_broadcast(true).map_err(|e| e.to_string())?;
    socket
        .send_to(&packet, (broadcast_addr, 9))
        .map_err(|e| format!("Send failed: {e}"))?;

    log::info!("[wol] Sent magic packet to {mac} via {broadcast_addr}");
    Ok(())
}
