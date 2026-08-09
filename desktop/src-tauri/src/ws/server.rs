//! The `device-desktop-ws` server — FR-021. The desktop is the WS server; each SDK is a client.
//!
//! Three things live here and nothing else does:
//!
//! - **the gate** (`admit`) — the handshake's trust and policy decision, in the order
//!   `ws::pairing` documents: recognise a returning device, else authorise a token, then register,
//!   then apply the access policy. It is a pure function so the order can be tested without a
//!   socket.
//! - **the connection** (`handle`) — one task per client: negotiate, gate, answer `paired`, then
//!   stream records. Unknown message types are ignored, malformed frames are discarded with a
//!   diagnostic (FR-000d, FR-036).
//! - **the sessions** (`Sessions`) — every record is filed under `(device_id, session_id)`, so two
//!   devices, or one device running two sessions, never share state (FR-021).
//!
//! Since feat-023 each record is also appended to `crate::frames`, the durable per-device log: the
//! map is the live view, the file is the record. A replay of an event already filed is dropped
//! before either sees it (FR-036), and a restart loses the rows but not the frames (FR-035b).

use std::{
    collections::{BTreeMap, HashSet},
    path::PathBuf,
    sync::{Mutex, MutexGuard},
};

use futures_util::{SinkExt, StreamExt};
use serde::Serialize;
use tauri::{AppHandle, Manager, State};
use time::OffsetDateTime;
use tokio::{
    io::{AsyncRead, AsyncWrite},
    net::TcpListener,
};
use tokio_tungstenite::tungstenite::Message;

use super::{
    negotiate_handshake,
    pairing::{self, PairingNack, PairingState, PairingToken, WS_PORT},
    AcceptedHandshake, HandshakeOutcome, HelloHandshake,
};
use crate::device::{self, Device, Observation, ObservedPlatform, Registry};

/// The frames that belong to a session. Everything else on the wire is either liveness
/// (`heartbeat`) or a message type this contract minor does not know — ignored, never an error.
const RECORD_TYPES: [&str; 5] = [
    "user_action",
    "log_event",
    "app_log",
    "crash_report",
    "media_chunk",
];

/// ponytail: a ring of the last N frames per session — the live view, bounded so a long soak cannot
/// eat the heap. The durable answer is `crate::frames`, which is what `records()` reads.
const MAX_RECORDS_PER_SESSION: usize = 500;

/// A connected device that has not sent a record carrying a `session_id` yet. It is still one
/// visible row — "connected but idle" is a state the operator needs to see.
const NO_SESSION: &str = "";

#[derive(Debug, Clone, Serialize)]
pub struct DeviceSession {
    pub device_id: String,
    pub session_id: String,
    pub workspace_id: String,
    pub display_name: String,
    pub platform: Option<ObservedPlatform>,
    pub os_version: String,
    pub contract_version: String,
    pub connected: bool,
    pub record_count: usize,
    #[serde(with = "time::serde::rfc3339")]
    pub started_at: OffsetDateTime,
    #[serde(with = "time::serde::rfc3339")]
    pub last_seen_at: OffsetDateTime,
    /// Not serialised to the list view — feat-017 asks for one session's records by key.
    #[serde(skip)]
    pub records: Vec<serde_json::Value>,
    /// FR-036: the identities already filed for this session, so a replay is dropped once.
    #[serde(skip)]
    seen: HashSet<String>,
}

#[derive(Default)]
pub struct Sessions {
    map: Mutex<BTreeMap<(String, String), DeviceSession>>,
    /// Where the durable log lives. `None` in tests and before the app is set up — the map then is
    /// the whole store, which is exactly what the protocol tests want.
    dir: Mutex<Option<PathBuf>>,
}

impl Sessions {
    fn map(&self) -> MutexGuard<'_, BTreeMap<(String, String), DeviceSession>> {
        // A poisoned lock means some other connection panicked. Losing every session over one bad
        // frame is worse than carrying on with the state that was there.
        self.map.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    fn dir(&self) -> Option<PathBuf> {
        self.dir.lock().ok().and_then(|dir| dir.clone())
    }

    /// Called once at startup with the app data dir. Until then records are memory-only.
    pub fn store_in(&self, dir: PathBuf) {
        if let Ok(mut slot) = self.dir.lock() {
            *slot = Some(dir);
        }
    }

    fn entry(
        &self,
        workspace_id: &str,
        device: &Device,
        session_id: &str,
        now: OffsetDateTime,
    ) -> MutexGuard<'_, BTreeMap<(String, String), DeviceSession>> {
        let mut map = self.map();
        map.entry((device.device_id.clone(), session_id.to_owned()))
            .or_insert_with(|| DeviceSession {
                device_id: device.device_id.clone(),
                session_id: session_id.to_owned(),
                workspace_id: workspace_id.to_owned(),
                display_name: device.display_name.clone(),
                platform: device.observed_platform,
                os_version: device.os_version.clone(),
                contract_version: device.sdk_contract_version.clone(),
                connected: true,
                record_count: 0,
                started_at: now,
                last_seen_at: now,
                records: Vec::new(),
                seen: HashSet::new(),
            });
        map
    }

    /// A device connected. Gives it a visible row before any record arrives.
    pub fn opened(&self, workspace_id: &str, device: &Device, now: OffsetDateTime) {
        let mut map = self.entry(workspace_id, device, NO_SESSION, now);
        if let Some(session) = map.get_mut(&(device.device_id.clone(), NO_SESSION.to_owned())) {
            session.connected = true;
            session.last_seen_at = now;
            session.display_name = device.display_name.clone();
        }
    }

    pub fn touched(&self, workspace_id: &str, device: &Device, session_id: &str, now: OffsetDateTime) {
        let key = (device.device_id.clone(), session_id.to_owned());
        let mut map = self.entry(workspace_id, device, session_id, now);
        if let Some(session) = map.get_mut(&key) {
            session.connected = true;
            session.last_seen_at = now;
        }
    }

    /// FR-021: the record lands under this device *and* this session, never anywhere else.
    /// FR-036: a repeated delivery of an event already filed here is dropped — one entry, always.
    /// Returns false when the frame was a replay, so the caller can say so in the diagnostic.
    pub fn record(
        &self,
        workspace_id: &str,
        device: &Device,
        session_id: &str,
        frame: serde_json::Value,
        now: OffsetDateTime,
    ) -> bool {
        let key = (device.device_id.clone(), session_id.to_owned());
        let mut map = self.entry(workspace_id, device, session_id, now);
        let Some(session) = map.get_mut(&key) else {
            return false;
        };
        session.connected = true;
        session.last_seen_at = now;

        if let Some(identity) = crate::frames::identity(&frame) {
            if !session.seen.insert(identity) {
                return false;
            }
        }

        session.record_count += 1;
        if session.records.len() == MAX_RECORDS_PER_SESSION {
            session.records.remove(0);
        }
        session.records.push(frame.clone());
        // The map is the live view; the file is the record. A write that fails is reported and does
        // not interrupt the stream — capture never depends on the store (Principle III).
        drop(map);
        if let Some(dir) = self.dir() {
            if let Err(error) = crate::frames::append(&dir, &device.device_id, session_id, &frame) {
                eprintln!("device-desktop-ws: {error}");
            }
        }
        true
    }

    /// The contract's "detect drop; keep session": the rows stay, they just stop being live.
    pub fn disconnected(&self, device_id: &str, now: OffsetDateTime) {
        for session in self.map().values_mut().filter(|s| s.device_id == device_id) {
            session.connected = false;
            session.last_seen_at = now;
        }
    }

    pub fn snapshot(&self, workspace_id: &str) -> Vec<DeviceSession> {
        self.map()
            .values()
            .filter(|s| s.workspace_id == workspace_id)
            .cloned()
            .collect()
    }

    /// The durable log is the answer whenever there is one — it is the superset (the in-memory ring
    /// is capped) and it is what makes a session readable after a restart.
    pub fn records(&self, device_id: &str, session_id: &str) -> Vec<serde_json::Value> {
        match self.dir() {
            Some(dir) => crate::frames::session(&dir, device_id, session_id),
            None => self
                .map()
                .get(&(device_id.to_owned(), session_id.to_owned()))
                .map(|s| s.records.clone())
                .unwrap_or_default(),
        }
    }

    /// Every frame this device streamed, across all its sessions. A Bug knows the *desktop's*
    /// session id, not the device's, so its evidence window resolves by device and by time.
    pub fn device_records(&self, device_id: &str) -> Vec<serde_json::Value> {
        match self.dir() {
            Some(dir) => crate::frames::read(&dir, device_id)
                .into_iter()
                .map(|stored| stored.frame)
                .collect(),
            None => self
                .map()
                .values()
                .filter(|s| s.device_id == device_id)
                .flat_map(|s| s.records.clone())
                .collect(),
        }
    }

    /// FR-035b: clear the general logs, keeping every frame inside a bug's evidence window. The
    /// live rows are re-seeded from what survived, so the screen and the file never disagree.
    pub fn clear(
        &self,
        device_id: &str,
        windows: &[(OffsetDateTime, OffsetDateTime)],
    ) -> Result<(), String> {
        if let Some(dir) = self.dir() {
            crate::frames::retain(&dir, device_id, windows)?;
        }
        // The same rule the file was rewritten by — `seen` is deliberately not reset, so a replay
        // arriving after a clear is still a replay.
        let inside = |frame: &serde_json::Value| {
            crate::frames::occurred_at(frame)
                .is_some_and(|at| windows.iter().any(|(from, to)| at >= *from && at <= *to))
        };
        for session in self.map().values_mut().filter(|s| s.device_id == device_id) {
            session.records.retain(&inside);
            session.record_count = session.records.len();
        }
        Ok(())
    }
}

/// The active workspace is the webview's (it owns the switcher), but the gate runs in Rust before
/// any webview call — so the one that owns the switch tells us, once, on mount and on switch.
#[derive(Default)]
pub struct WsServer {
    pub sessions: Sessions,
    pub workspace_id: Mutex<String>,
}

fn row<'a>(registry: &'a Registry, workspace_id: &str, device_id: &str) -> Option<&'a Device> {
    registry
        .devices
        .iter()
        .find(|d| d.workspace_id == workspace_id && d.device_id == device_id)
}

/// The handshake gate. Runs in the order `ws::pairing::Authorized` documents.
///
/// Note what registering *before* the policy check means: a device presenting a valid pairing token
/// is admitted under `allowlist` too, because minting that QR is the operator's act of admission
/// (FR-016/FR-017). What `allowlist` refuses is a device that never paired — it has no credential
/// and no token, so it never gets past step 2.
pub fn admit(
    registry: &mut Registry,
    slot: &mut Option<PairingToken>,
    workspace_id: &str,
    hello: &HelloHandshake,
    accepted: &AcceptedHandshake,
    now: OffsetDateTime,
) -> Result<(Device, String), PairingNack> {
    if hello.device_id.trim().is_empty() {
        return Err(PairingNack::refused(
            "malformed",
            "The hello frame carried no device_id, so nothing can be registered against it.",
        ));
    }

    // FR-018: disabled is disabled, whichever credential is presented. Checked first so a disabled
    // device is told why instead of being sent back to the QR it will also be refused from.
    if let Some(existing) = row(registry, workspace_id, &hello.device_id) {
        if !existing.enabled {
            return Err(PairingNack::refused(
                "disabled",
                device::admits(registry, workspace_id, &hello.device_id)
                    .err()
                    .unwrap_or_else(|| "This device is disabled for this workspace.".into()),
            ));
        }
    }

    // 1 & 2 — recognise the returning device, else the token is the only way in (FR-018/019/020).
    let credential = match hello.reconnect_credential.as_deref().filter(|c| !c.is_empty()) {
        Some(cred) if device::reconnects(registry, workspace_id, &hello.device_id, cred) => {
            cred.to_owned()
        }
        _ => pairing::authorize(slot, hello, now)?.reconnect_credential,
    };

    // 3 — record the pairing, filling FR-022's observed facts from the handshake.
    let device = device::register(
        registry,
        workspace_id,
        &Observation {
            device_id: hello.device_id.clone(),
            contract_version: accepted.device_contract_version.as_str().to_owned(),
            capabilities: accepted.device_capabilities.clone(),
            platform: hello.platform,
            os_version: hello.os_version.clone(),
        },
        &credential,
        now,
    );

    // 4 — the policy filter, before any record reaches a viewer or a store (FR-017, SC-008).
    device::admits(registry, workspace_id, &hello.device_id)
        .map_err(|why| PairingNack::refused("not_allowlisted", why))?;

    Ok((device, credential))
}

type Gate = dyn Fn(&HelloHandshake, &AcceptedHandshake) -> Result<(Device, String), PairingNack>
    + Send
    + Sync;

async fn send<S: AsyncRead + AsyncWrite + Unpin>(
    socket: &mut tokio_tungstenite::WebSocketStream<S>,
    frame: &impl Serialize,
) -> Result<(), String> {
    let json = serde_json::to_string(frame).map_err(|e| e.to_string())?;
    socket.send(Message::text(json)).await.map_err(|e| e.to_string())
}

/// One client, start to finish. Takes the gate as a parameter so the protocol can be exercised
/// over an in-memory pipe without a Tauri app behind it.
pub async fn handle<S: AsyncRead + AsyncWrite + Unpin>(
    stream: S,
    sessions: &Sessions,
    workspace_id: &str,
    gate: &Gate,
) -> Result<(), String> {
    let mut socket = tokio_tungstenite::accept_async(stream)
        .await
        .map_err(|e| format!("upgrade refused: {e}"))?;

    let (device, credential, mut paired) = loop {
        let Some(message) = socket.next().await else {
            return Ok(());
        };
        let text = match message.map_err(|e| e.to_string())? {
            Message::Text(text) => text,
            Message::Close(_) => return Ok(()),
            // FR-000d: anything else before the hello is not an error, it is just not the hello.
            _ => continue,
        };

        match negotiate_handshake(&text) {
            Ok(HandshakeOutcome::IgnoredUnknownMessage) => continue,
            Ok(HandshakeOutcome::Refused(mismatch)) => {
                send(&mut socket, &mismatch).await?;
                return socket.close(None).await.map_err(|e| e.to_string());
            }
            Err(error) => {
                let nack = PairingNack::refused("malformed", error.to_string());
                send(&mut socket, &nack).await?;
                return socket.close(None).await.map_err(|e| e.to_string());
            }
            Ok(HandshakeOutcome::Accepted(accepted)) => {
                // ponytail: negotiation only keeps the version half of the frame, so the trust half
                // is re-read here. Cheaper than threading the whole hello through the outcome type.
                let hello: HelloHandshake =
                    serde_json::from_str(&text).map_err(|e| e.to_string())?;
                match gate(&hello, &accepted) {
                    Ok((device, credential)) => break (device, credential, accepted.response),
                    Err(nack) => {
                        send(&mut socket, &nack).await?;
                        return socket.close(None).await.map_err(|e| e.to_string());
                    }
                }
            }
        }
    };

    paired.device = Some(device.clone());
    paired.reconnect_credential = Some(credential);
    send(&mut socket, &paired).await?;
    sessions.opened(workspace_id, &device, OffsetDateTime::now_utc());

    // A record without its own `session_id` belongs to the session the device is currently in —
    // `user_action` may omit it, and dropping those would lose the grouping key feat-018 needs.
    let mut current = NO_SESSION.to_owned();

    while let Some(message) = socket.next().await {
        let now = OffsetDateTime::now_utc();
        let text = match message {
            Ok(Message::Text(text)) => text,
            // feat-021 owns the binary half of `media_chunk`; the control frame above is what
            // files it, so an early payload is liveness and nothing more.
            Ok(Message::Binary(_)) | Ok(Message::Ping(_)) | Ok(Message::Pong(_)) => {
                sessions.touched(workspace_id, &device, &current, now);
                continue;
            }
            Ok(Message::Close(_)) | Err(_) => break,
            Ok(Message::Frame(_)) => continue,
        };

        // FR-036: a malformed frame is discarded with a diagnostic, never shown as valid data.
        let Some(frame) = serde_json::from_str::<serde_json::Value>(&text)
            .ok()
            .filter(|value| value.get("type").and_then(serde_json::Value::as_str).is_some())
        else {
            eprintln!(
                "device-desktop-ws: discarded a malformed frame from {}",
                device.device_id
            );
            continue;
        };
        let kind = frame["type"].as_str().unwrap_or_default().to_owned();

        if let Some(session_id) = frame
            .get("session_id")
            .and_then(serde_json::Value::as_str)
            .filter(|id| !id.is_empty())
        {
            current = session_id.to_owned();
        }

        if RECORD_TYPES.contains(&kind.as_str()) {
            // FR-036: a replay is not an error and not a second entry — it is a no-op with a note.
            if !sessions.record(workspace_id, &device, &current, frame, now) {
                eprintln!(
                    "device-desktop-ws: ignored a repeated {kind} from {}",
                    device.device_id
                );
            }
        } else {
            // `heartbeat`, and any type a newer minor invented: liveness, ignored silently.
            sessions.touched(workspace_id, &device, &current, now);
        }
    }

    sessions.disconnected(&device.device_id, OffsetDateTime::now_utc());
    Ok(())
}

fn gate_with(app: &AppHandle) -> impl Fn(&HelloHandshake, &AcceptedHandshake) -> Result<(Device, String), PairingNack> + Send + Sync {
    let app = app.clone();
    move |hello, accepted| {
        let server: State<'_, WsServer> = app.state();
        let pairing: State<'_, PairingState> = app.state();
        let workspace_id = server
            .workspace_id
            .lock()
            .map(|id| id.clone())
            .unwrap_or_default();
        if workspace_id.is_empty() {
            return Err(PairingNack::refused(
                "not_allowlisted",
                "No workspace is open on the desktop yet. Sign in and open one, then pair again.",
            ));
        }

        // ponytail: holding the pairing lock across the whole gate serialises concurrent
        // handshakes, which is also what keeps the read-modify-write of devices.json honest.
        let mut slot = pairing
            .0
            .lock()
            .map_err(|e| PairingNack::refused("malformed", e.to_string()))?;
        let mut registry =
            device::load(&app).map_err(|e| PairingNack::refused("malformed", e))?;
        let admitted = admit(
            &mut registry,
            &mut slot,
            &workspace_id,
            hello,
            accepted,
            OffsetDateTime::now_utc(),
        )?;
        device::save(&app, &registry).map_err(|e| PairingNack::refused("malformed", e))?;
        Ok(admitted)
    }
}

/// Binds `WS_PORT` and serves until the app exits. A failure to bind is reported and not fatal:
/// the desktop is still usable for everything that is not a device session.
pub fn start(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let listener = match TcpListener::bind(("0.0.0.0", WS_PORT)).await {
            Ok(listener) => listener,
            Err(error) => {
                eprintln!("device-desktop-ws: could not bind port {WS_PORT}: {error}");
                return;
            }
        };

        loop {
            let Ok((stream, peer)) = listener.accept().await else {
                continue;
            };
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                let gate = gate_with(&app);
                let server: State<'_, WsServer> = app.state();
                let workspace_id = server
                    .workspace_id
                    .lock()
                    .map(|id| id.clone())
                    .unwrap_or_default();
                if let Err(error) = handle(stream, &server.sessions, &workspace_id, &gate).await {
                    eprintln!("device-desktop-ws: {peer}: {error}");
                }
            });
        }
    });
}

#[tauri::command]
pub fn device_sessions(server: State<'_, WsServer>, workspace_id: String) -> Vec<DeviceSession> {
    server.sessions.snapshot(&workspace_id)
}

/// FR-029a: one session's raw frames, in arrival order, for the live viewer. The frames cross as
/// they came off the wire — the webview owns what a row looks like, and it never branches on
/// platform, which is what makes iOS and Android identical by construction.
#[tauri::command]
pub fn session_records(
    server: State<'_, WsServer>,
    device_id: String,
    session_id: String,
) -> Vec<serde_json::Value> {
    server.sessions.records(&device_id, &session_id)
}

/// FR-035b: every frame a device streamed, for a Bug's evidence window. One call rather than
/// "list sessions, then read each" — a marked moment resolves by device and by time, and after a
/// restart there are no live session rows to enumerate.
#[tauri::command]
pub fn device_records(server: State<'_, WsServer>, device_id: String) -> Vec<serde_json::Value> {
    server.sessions.device_records(&device_id)
}

/// FR-035b: clear this device's general logs. Every frame inside *any* bug's evidence window is
/// kept — including bugs in another workspace, because clearing a screen is not a licence to drop
/// somebody else's evidence.
#[tauri::command]
pub fn clear_device_logs(
    app: AppHandle,
    server: State<'_, WsServer>,
    device_id: String,
) -> Result<(), String> {
    let windows: Vec<(OffsetDateTime, OffsetDateTime)> = crate::bug::load(&app)?
        .iter()
        .filter(|bug| bug.device_id == device_id)
        .map(|bug| (bug.window_start, bug.window_end))
        .collect();
    server.sessions.clear(&device_id, &windows)
}

/// Called by the webview on mount and on every workspace switch — the gate cannot ask React which
/// workspace is open, and a record must never be filed against the wrong one (FR-001).
#[tauri::command]
pub fn set_active_workspace(server: State<'_, WsServer>, workspace_id: String) {
    if let Ok(mut active) = server.workspace_id.lock() {
        *active = workspace_id;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::device::AccessPolicy;
    use time::format_description::well_known::Rfc3339;

    fn at(value: &str) -> OffsetDateTime {
        OffsetDateTime::parse(value, &Rfc3339).unwrap()
    }

    fn hello(device_id: &str, token: Option<&str>, credential: Option<&str>) -> HelloHandshake {
        HelloHandshake {
            contract_version: super::super::CONTRACT_VERSION.into(),
            capabilities: vec!["api_capture".into()],
            device_id: device_id.into(),
            pairing_token: token.map(str::to_owned),
            reconnect_credential: credential.map(str::to_owned),
            platform: Some(ObservedPlatform::Android),
            os_version: Some("14".into()),
            display_name: None,
        }
    }

    fn accepted() -> AcceptedHandshake {
        let frame = r#"{"type":"hello","contract_version":"1.2.0","capabilities":["api_capture"]}"#;
        match negotiate_handshake(frame).unwrap() {
            HandshakeOutcome::Accepted(accepted) => accepted,
            _ => panic!("same-major hello must be accepted"),
        }
    }

    // FR-020 / FR-022 — the token is the only way in, and the handshake's observed facts land.
    #[test]
    fn a_token_pairs_registers_and_reports_the_platform() {
        let now = at("2026-08-10T10:00:00Z");
        let mut registry = Registry::default();
        let mut slot = None;
        let token = pairing::mint(&mut slot, "ws://10.0.0.4:8787".into(), now);

        let refused = admit(
            &mut registry,
            &mut slot,
            "ws-1",
            &hello("sdk-a", None, None),
            &accepted(),
            now,
        )
        .unwrap_err();
        assert_eq!(refused.reason, "expired_token");
        assert!(registry.devices.is_empty(), "a refused hello registers nothing");

        let (device, credential) = admit(
            &mut registry,
            &mut slot,
            "ws-1",
            &hello("sdk-a", Some(&token.token), None),
            &accepted(),
            now,
        )
        .unwrap();
        assert_eq!(device.device_id, "sdk-a");
        assert_eq!(device.observed_platform, Some(ObservedPlatform::Android));
        assert_eq!(device.os_version, "14");
        assert_eq!(device.sdk_contract_version, "1.2.0");
        assert!(!credential.is_empty());

        // FR-018/019: the credential it was handed gets it back in without a new QR.
        let (again, same) = admit(
            &mut registry,
            &mut slot,
            "ws-1",
            &hello("sdk-a", None, Some(&credential)),
            &accepted(),
            now,
        )
        .unwrap();
        assert_eq!(again.id, device.id, "a return visit is not a second row");
        assert_eq!(same, credential);
    }

    // FR-017 / FR-018 / SC-008 — the policy filter, at the gate, before any record.
    #[test]
    fn a_disabled_or_unregistered_device_is_nacked_at_the_handshake() {
        let now = at("2026-08-10T10:00:00Z");
        let mut registry = Registry::default();
        let mut slot = None;
        let token = pairing::mint(&mut slot, "ws://10.0.0.4:8787".into(), now);
        let (device, credential) = admit(
            &mut registry,
            &mut slot,
            "ws-1",
            &hello("sdk-a", Some(&token.token), None),
            &accepted(),
            now,
        )
        .unwrap();

        device::set_enabled(&mut registry, "ws-1", &device.id, false).unwrap();
        let refused = admit(
            &mut registry,
            &mut slot,
            "ws-1",
            &hello("sdk-a", None, Some(&credential)),
            &accepted(),
            now,
        )
        .unwrap_err();
        assert_eq!(refused.reason, "disabled");

        // Removed under `allowlist`: the credential is gone with the row, so it needs a new token.
        device::set_enabled(&mut registry, "ws-1", &device.id, true).unwrap();
        device::remove(&mut registry, "ws-1", &device.id).unwrap();
        assert_eq!(registry.policy, AccessPolicy::Allowlist);
        let refused = admit(
            &mut registry,
            &mut slot,
            "ws-1",
            &hello("sdk-a", None, Some(&credential)),
            &accepted(),
            now,
        )
        .unwrap_err();
        assert_eq!(refused.reason, "expired_token");
    }

    fn registered(device_id: &str, name: &str) -> Device {
        Device {
            id: format!("dev-{device_id}"),
            workspace_id: "ws-1".into(),
            device_id: device_id.into(),
            display_name: name.into(),
            observed_platform: None,
            enabled: true,
            reconnect_credential_hash: None,
            sdk_contract_version: "1.0.0".into(),
            sdk_capabilities: Vec::new(),
            os_version: String::new(),
            registered_at: at("2026-08-10T10:00:00Z"),
        }
    }

    fn client_frames(device_id: &str, session_id: &str) -> Vec<String> {
        vec![
            format!(
                r#"{{"type":"hello","contract_version":"1.0.0","capabilities":[],"device_id":"{device_id}"}}"#
            ),
            format!(
                r#"{{"type":"log_event","session_id":"{session_id}","request_id":"r1","phase":"started"}}"#
            ),
            // No `session_id`: it belongs to the session the device is already in (FR-039a).
            r#"{"type":"user_action","action_id":"a1","action_type":"tap"}"#.into(),
            // FR-000d / FR-036: ignored and discarded, and neither stops the stream.
            r#"{"type":"invented_by_a_newer_minor","payload":1}"#.into(),
            "{not json".into(),
            format!(
                r#"{{"type":"app_log","session_id":"{session_id}","log_id":"l1","level":"info"}}"#
            ),
        ]
    }

    // FR-035b / FR-036 — the durable half. Three promises in one run: a replay is never a second
    // entry, a restart keeps the frames, and clearing the general logs keeps a bug's window.
    #[test]
    fn a_replay_is_dropped_frames_survive_a_restart_and_clearing_keeps_the_evidence_window() {
        let dir = std::env::temp_dir().join(format!(
            "server-frames-{}",
            OffsetDateTime::now_utc().unix_timestamp_nanos()
        ));
        let sessions = Sessions::default();
        sessions.store_in(dir.clone());
        let device = registered("sdk-a", "Bench A");
        let now = at("2026-08-10T10:15:00Z");
        let frame = |request: &str, when: &str| {
            serde_json::json!({
                "type": "log_event", "request_id": request, "phase": "started", "started_at": when
            })
        };

        assert!(sessions.record("ws-1", &device, "sess-1", frame("r1", "2026-08-10T10:14:45Z"), now));
        assert!(
            !sessions.record("ws-1", &device, "sess-1", frame("r1", "2026-08-10T10:14:45Z"), now),
            "the same request_id+phase delivered twice is one entry"
        );
        assert!(sessions.record("ws-1", &device, "sess-1", frame("r2", "2026-08-10T11:00:00Z"), now));
        assert_eq!(sessions.records("sdk-a", "sess-1").len(), 2);
        assert_eq!(sessions.snapshot("ws-1")[0].record_count, 2);

        // A restart is exactly this: a fresh map over the same directory.
        let restarted = Sessions::default();
        restarted.store_in(dir.clone());
        assert!(restarted.snapshot("ws-1").is_empty(), "no device is connected after a restart");
        assert_eq!(restarted.device_records("sdk-a").len(), 2, "the frames are still there");
        assert_eq!(restarted.records("sdk-a", "sess-1").len(), 2);

        // FR-035b: clearing the general logs cannot empty a bug's already-captured evidence.
        let window = (at("2026-08-10T10:14:30Z"), at("2026-08-10T10:15:30Z"));
        sessions.clear("sdk-a", &[window]).unwrap();
        let left = sessions.records("sdk-a", "sess-1");
        assert_eq!(left.len(), 1);
        assert_eq!(left[0]["request_id"], "r1");
        assert_eq!(sessions.snapshot("ws-1")[0].record_count, 1, "the live rows agree with the file");
        // And the replay guard outlives the clear — a re-sent r1 is still a replay.
        assert!(!sessions.record("ws-1", &device, "sess-1", frame("r1", "2026-08-10T10:14:45Z"), now));

        std::fs::remove_dir_all(&dir).ok();
    }

    // FR-021 — two devices connected at once, each with its own session, over real WS framing.
    #[tokio::test]
    async fn two_devices_stream_concurrently_without_sharing_state() {
        let sessions = Sessions::default();
        let gate: Box<Gate> = Box::new(|hello: &HelloHandshake, _: &AcceptedHandshake| {
            Ok((
                registered(&hello.device_id, &format!("Bench {}", hello.device_id)),
                "cred".into(),
            ))
        });

        let mut servers = Vec::new();
        for (device_id, session_id) in [("sdk-a", "sess-1"), ("sdk-b", "sess-1")] {
            let (server_side, client_side) = tokio::io::duplex(8 * 1024);
            servers.push(handle(server_side, &sessions, "ws-1", gate.as_ref()));

            tokio::spawn(async move {
                let (mut client, _) = tokio_tungstenite::client_async("ws://desktop/", client_side)
                    .await
                    .unwrap();
                for frame in client_frames(device_id, session_id) {
                    client.send(Message::text(frame)).await.unwrap();
                }
                client.close(None).await.unwrap();
                // Stay on the wire until the server closes back — dropping the client half early
                // would break the pipe under the reply it is still writing.
                while client.next().await.is_some() {}
            });
        }

        // Both connections run at the same time — that is the concurrency FR-021 asks for.
        let (first, second) = futures_util::future::join(
            servers.pop().unwrap(),
            servers.pop().unwrap(),
        )
        .await;
        first.unwrap();
        second.unwrap();

        let visible = sessions.snapshot("ws-1");
        let named: Vec<_> = visible
            .iter()
            .map(|s| (s.device_id.as_str(), s.session_id.as_str(), s.record_count))
            .collect();
        // Same session ID on both devices must stay two rows — the device is half of the key.
        assert!(named.contains(&("sdk-a", "sess-1", 3)), "{named:?}");
        assert!(named.contains(&("sdk-b", "sess-1", 3)), "{named:?}");
        assert!(visible.iter().all(|s| !s.connected), "both dropped cleanly");
        assert_eq!(
            sessions.records("sdk-a", "sess-1").len(),
            3,
            "the malformed and unknown frames are not records"
        );
        assert!(visible.iter().any(|s| s.session_id == NO_SESSION && s.record_count == 0));
        assert_eq!(sessions.snapshot("ws-2").len(), 0, "sessions do not cross workspaces");
    }

    // FR-021 — the same thing over a real TCP listener, so the accept path is exercised too, not
    // just the framing. Port 0: the OS picks, because a fixed port makes the suite fail on a
    // machine that already has the desktop running.
    #[tokio::test]
    async fn two_devices_connect_over_a_real_socket() {
        let listener = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
        let address = listener.local_addr().unwrap();
        let sessions = std::sync::Arc::new(Sessions::default());

        let serving = {
            let sessions = sessions.clone();
            tokio::spawn(async move {
                let mut connections = Vec::new();
                for _ in 0..2 {
                    let (stream, _) = listener.accept().await.unwrap();
                    let sessions = sessions.clone();
                    connections.push(tokio::spawn(async move {
                        let gate: Box<Gate> =
                            Box::new(|hello: &HelloHandshake, _: &AcceptedHandshake| {
                                Ok((registered(&hello.device_id, "Bench"), "cred".into()))
                            });
                        handle(stream, &sessions, "ws-1", gate.as_ref()).await.unwrap();
                    }));
                }
                for connection in connections {
                    connection.await.unwrap();
                }
            })
        };

        for device_id in ["sdk-a", "sdk-b"] {
            let stream = tokio::net::TcpStream::connect(address).await.unwrap();
            let (mut client, _) = tokio_tungstenite::client_async("ws://desktop/", stream)
                .await
                .unwrap();
            for frame in client_frames(device_id, "sess-1") {
                client.send(Message::text(frame)).await.unwrap();
            }
            client.close(None).await.unwrap();
            while client.next().await.is_some() {}
        }

        serving.await.unwrap();
        assert_eq!(sessions.records("sdk-a", "sess-1").len(), 3);
        assert_eq!(sessions.records("sdk-b", "sess-1").len(), 3);
    }

    // FR-021 — one device, two sessions: the session ID is the other half of the key.
    #[tokio::test]
    async fn one_device_running_two_sessions_keeps_them_apart() {
        let sessions = Sessions::default();
        let gate: Box<Gate> = Box::new(|hello: &HelloHandshake, _: &AcceptedHandshake| {
            Ok((registered(&hello.device_id, "Bench iPhone"), "cred".into()))
        });
        let (server_side, client_side) = tokio::io::duplex(8 * 1024);

        tokio::spawn(async move {
            let (mut client, _) = tokio_tungstenite::client_async("ws://desktop/", client_side)
                .await
                .unwrap();
            for frame in [
                r#"{"type":"hello","contract_version":"1.0.0","capabilities":[],"device_id":"sdk-a"}"#,
                r#"{"type":"log_event","session_id":"sess-1","request_id":"r1","phase":"started"}"#,
                r#"{"type":"log_event","session_id":"sess-2","request_id":"r2","phase":"started"}"#,
                r#"{"type":"log_event","session_id":"sess-2","request_id":"r3","phase":"started"}"#,
            ] {
                client.send(Message::text(frame)).await.unwrap();
            }
            client.close(None).await.unwrap();
            while client.next().await.is_some() {}
        });

        handle(server_side, &sessions, "ws-1", gate.as_ref()).await.unwrap();

        assert_eq!(sessions.records("sdk-a", "sess-1").len(), 1);
        assert_eq!(sessions.records("sdk-a", "sess-2").len(), 2);
    }

    // FR-000c / SC-020 — a major mismatch is refused cleanly, with no session created.
    #[tokio::test]
    async fn a_major_mismatch_is_nacked_and_never_opens_a_session() {
        let sessions = Sessions::default();
        let gate: Box<Gate> = Box::new(|_: &HelloHandshake, _: &AcceptedHandshake| {
            panic!("the gate must not run for a refused version")
        });
        let (server_side, client_side) = tokio::io::duplex(8 * 1024);

        let client = tokio::spawn(async move {
            let (mut client, _) = tokio_tungstenite::client_async("ws://desktop/", client_side)
                .await
                .unwrap();
            client
                .send(Message::text(
                    r#"{"type":"hello","contract_version":"9.0.0","capabilities":[],"device_id":"sdk-a"}"#,
                ))
                .await
                .unwrap();
            let reply = client.next().await.unwrap().unwrap().into_text().unwrap();
            serde_json::from_str::<serde_json::Value>(&reply).unwrap()
        });

        handle(server_side, &sessions, "ws-1", gate.as_ref()).await.unwrap();
        let nack = client.await.unwrap();
        assert_eq!(nack["type"], "nack");
        assert_eq!(nack["reason"], "version_mismatch");
        assert_eq!(nack["out_of_date"], "desktop");
        assert!(sessions.snapshot("ws-1").is_empty());
    }

    // The `paired` frame the SDK stores: its device row, its credential, our capabilities.
    #[tokio::test]
    async fn a_paired_device_is_told_its_row_and_its_reconnect_credential() {
        let sessions = Sessions::default();
        let gate: Box<Gate> = Box::new(|hello: &HelloHandshake, _: &AcceptedHandshake| {
            Ok((registered(&hello.device_id, "Bench iPhone"), "cred-xyz".into()))
        });
        let (server_side, client_side) = tokio::io::duplex(8 * 1024);

        let client = tokio::spawn(async move {
            let (mut client, _) = tokio_tungstenite::client_async("ws://desktop/", client_side)
                .await
                .unwrap();
            client
                .send(Message::text(
                    r#"{"type":"hello","contract_version":"1.0.0","capabilities":[],"device_id":"sdk-a"}"#,
                ))
                .await
                .unwrap();
            let reply = client.next().await.unwrap().unwrap().into_text().unwrap();
            client.close(None).await.unwrap();
            serde_json::from_str::<serde_json::Value>(&reply).unwrap()
        });

        handle(server_side, &sessions, "ws-1", gate.as_ref()).await.unwrap();
        let paired = client.await.unwrap();
        assert_eq!(paired["type"], "paired");
        assert_eq!(paired["contract_version"], super::super::CONTRACT_VERSION);
        assert_eq!(paired["capabilities"][0], "action_grouping");
        assert_eq!(paired["device"]["display_name"], "Bench iPhone");
        assert_eq!(paired["reconnect_credential"], "cred-xyz");
    }
}
