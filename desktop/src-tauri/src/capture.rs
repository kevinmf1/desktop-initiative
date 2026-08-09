//! Bug-attached captures — FR-044, FR-044a, FR-044b.
//!
//! The device's only upload target is the desktop (FR-044a): a `media_chunk` control frame names the
//! capture, the binary WebSocket frame after it carries the bytes, and this module is where those
//! bytes land. Three rules make the rest fall out:
//!
//! - **the file is the offset.** A chunk is written at the offset the control frame names, and what
//!   has been received is the file's own length — so an interrupted transfer resumes from what is on
//!   disk rather than restarting, with no separate progress record to disagree with the bytes;
//! - **complete means verified.** A capture is only `verified` once the whole object hashes to the
//!   `sha256` the device declared. A mismatch truncates back to nothing rather than presenting a
//!   short file as evidence (contract, *Media transfer interrupted*);
//! - **the binary rides its own outbox.** `crate::sync` pushes the capture's *metadata* with the
//!   Bug; the bytes go out here, on their own tick, so a 5-minute recording can never hold up a
//!   2 KB bug record (FR-044b).
//!
//! One `<hash>.json` + `<hash>.bin` pair is kept per capture, with no index file. The metadata sits
//! beside its bytes, which is what lets the WebSocket path write a capture with no app handle and
//! nothing to keep in sync. The upgrade path, if a workspace ever holds thousands, is the same
//! SQLite move `frames.rs` names.

use std::{
    fs::{self, OpenOptions},
    io::{Seek, SeekFrom, Write},
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager, State};
use time::OffsetDateTime;

use crate::{sync::CONTRACT_VERSION, ws::server::WsServer};

pub const DIR: &str = "captures";

/// How often the media outbox retries by itself. Deliberately *not* the record outbox's tick — the
/// two are independent by FR-044b, and a large upload should not pace the small records.
const RETRY_SECONDS: u64 = 90;

/// One bug-attached capture. `received` and `verified` are the FR-044a "pending upload" state: a Bug
/// shows evidence-in-transit rather than appearing to have none.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Capture {
    /// The device's `capture_id` — the same id `POST /v1/media/{capture_id}/confirm` is keyed by.
    pub id: String,
    pub bug_id: String,
    pub workspace_id: String,
    pub device_id: String,
    pub content_type: String,
    pub total_size: u64,
    /// The device's declared full-object checksum. Nothing is uploaded until the bytes match it.
    pub sha256: String,
    /// Bytes on disk — the file's own length, so a resume asks the file, not a counter.
    pub received: u64,
    #[serde(default)]
    pub verified: bool,
    #[serde(default)]
    pub remote_ref: Option<String>,
    /// Set only after `confirm` succeeded: the backend has verified the stored object.
    #[serde(default, with = "time::serde::rfc3339::option")]
    pub uploaded_at: Option<OffsetDateTime>,
    /// FR-044b: the *metadata's* sync clock, on the record outbox — independent of the bytes above.
    #[serde(default, with = "time::serde::rfc3339::option")]
    pub synced_at: Option<OffsetDateTime>,
    #[serde(with = "time::serde::rfc3339")]
    pub received_at: OffsetDateTime,
}

impl Capture {
    /// What the operator is told. Derived, never stored — a stored state is one more thing that can
    /// disagree with the bytes.
    pub fn pending_upload(&self) -> bool {
        self.uploaded_at.is_none()
    }
}

/// A capture id is device-supplied and reaches the filesystem, so it is hashed rather than
/// sanitised — same reasoning as `frames::device_file`.
fn stem(dir: &Path, id: &str) -> PathBuf {
    let digest = Sha256::digest(id.as_bytes());
    let hex: String = digest[..8]
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect();
    dir.join(hex)
}

fn blob_path(dir: &Path, id: &str) -> PathBuf {
    stem(dir, id).with_extension("bin")
}

fn meta_path(dir: &Path, id: &str) -> PathBuf {
    stem(dir, id).with_extension("json")
}

fn text(frame: &Value, key: &str) -> String {
    frame
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_owned()
}

pub fn save(dir: &Path, capture: &Capture) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|e| format!("Could not create {}: {e}", dir.display()))?;
    let path = meta_path(dir, &capture.id);
    let raw = serde_json::to_string_pretty(capture).map_err(|e| e.to_string())?;
    fs::write(&path, raw).map_err(|e| format!("Could not write {}: {e}", path.display()))
}

/// Every capture on disk. An unreadable sidecar is skipped rather than failing the read — one bad
/// file must not cost the operator every other bug's evidence.
pub fn load(dir: &Path) -> Vec<Capture> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut captures: Vec<Capture> = entries
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.extension().is_some_and(|ext| ext == "json"))
        .filter_map(
            |path| match fs::read_to_string(&path).map(|raw| serde_json::from_str(&raw)) {
                Ok(Ok(capture)) => Some(capture),
                _ => {
                    eprintln!(
                        "captures: skipped an unreadable record at {}",
                        path.display()
                    );
                    None
                }
            },
        )
        .collect();
    captures.sort_by(|a, b| a.received_at.cmp(&b.received_at));
    captures
}

pub fn bytes(dir: &Path, id: &str) -> Result<Vec<u8>, String> {
    let path = blob_path(dir, id);
    fs::read(&path).map_err(|e| format!("Could not read {}: {e}", path.display()))
}

/// One `media_chunk`: the control frame that named it, plus the binary frame that followed.
///
/// Writing at the declared offset is what makes the transfer resumable — a repeat of a chunk already
/// on disk overwrites the same bytes and changes nothing, which is the FR-036 property the binary
/// half gets for free.
pub fn receive(
    dir: &Path,
    workspace_id: &str,
    device_id: &str,
    control: &Value,
    payload: &[u8],
    now: OffsetDateTime,
) -> Result<Capture, String> {
    let id = text(control, "capture_id");
    if id.is_empty() {
        return Err(
            "A media_chunk arrived with no capture_id — nothing can be filed against it.".into(),
        );
    }
    let bug_id = text(control, "bug_id");
    let content_type = text(control, "content_type");
    let offset = control.get("offset").and_then(Value::as_u64).unwrap_or(0);
    let chunk_size = control
        .get("chunk_size")
        .and_then(Value::as_u64)
        .unwrap_or(0);
    let total_size = control
        .get("total_size")
        .and_then(Value::as_u64)
        .unwrap_or(0);
    let sha256 = text(control, "sha256");
    let end = offset
        .checked_add(payload.len() as u64)
        .ok_or("A media_chunk offset overflowed its declared object size.")?;
    if bug_id.is_empty()
        || content_type.is_empty()
        || total_size == 0
        || chunk_size != payload.len() as u64
        || end > total_size
        || sha256.len() != 64
        || !sha256.bytes().all(|byte| byte.is_ascii_hexdigit())
    {
        return Err(
            "A media_chunk did not match its declared metadata — payload discarded.".into(),
        );
    }

    let mut capture = load(dir)
        .into_iter()
        .find(|existing| existing.id == id)
        .unwrap_or(Capture {
            id: id.clone(),
            bug_id: bug_id.clone(),
            workspace_id: workspace_id.to_owned(),
            device_id: device_id.to_owned(),
            content_type: content_type.clone(),
            total_size,
            sha256: sha256.clone(),
            received: 0,
            verified: false,
            remote_ref: None,
            uploaded_at: None,
            synced_at: None,
            received_at: now,
        });
    if capture.workspace_id != workspace_id
        || capture.device_id != device_id
        || capture.bug_id != bug_id
        || capture.content_type != content_type
        || capture.total_size != total_size
        || !capture.sha256.eq_ignore_ascii_case(&sha256)
    {
        return Err(
            "A media_chunk reused a capture_id with conflicting metadata — payload discarded."
                .into(),
        );
    }

    fs::create_dir_all(dir).map_err(|e| format!("Could not create {}: {e}", dir.display()))?;
    let path = blob_path(dir, &id);
    let mut file = OpenOptions::new()
        .create(true)
        .write(true)
        .read(true)
        .open(&path)
        .map_err(|e| format!("Could not open {}: {e}", path.display()))?;
    file.seek(SeekFrom::Start(offset))
        .and_then(|_| file.write_all(payload))
        .map_err(|e| format!("Could not write {}: {e}", path.display()))?;
    capture.received = file
        .metadata()
        .map(|meta| meta.len())
        .map_err(|e| format!("Could not measure {}: {e}", path.display()))?;
    drop(file);

    // "Mark complete only after the checksum verifies" — a truncated or corrupted object is thrown
    // away and the transfer starts again, rather than being linked as complete evidence.
    if capture.total_size > 0 && capture.received >= capture.total_size {
        let digest: String = Sha256::digest(fs::read(&path).map_err(|e| e.to_string())?)
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect();
        if digest.eq_ignore_ascii_case(&capture.sha256) {
            capture.verified = true;
        } else {
            eprintln!(
                "captures: {id} failed its checksum — discarding the bytes and awaiting a resend"
            );
            fs::write(&path, []).map_err(|e| format!("Could not clear {}: {e}", path.display()))?;
            capture.received = 0;
            capture.verified = false;
        }
    }
    // The metadata changed, so the backend's copy is stale: back into the record outbox (FR-044b).
    capture.received_at = now;
    capture.synced_at = None;
    save(dir, &capture)?;
    Ok(capture)
}

/// FR-035b's rule applied to media: a capture is only ever uploaded once, and only once its bytes
/// are the bytes the device declared.
pub fn queued(captures: &[Capture], workspace_id: &str) -> Vec<Capture> {
    captures
        .iter()
        .filter(|c| c.workspace_id == workspace_id && c.verified && c.uploaded_at.is_none())
        .cloned()
        .collect()
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
pub struct MediaReport {
    /// Captures still waiting after this attempt — what the Bugs screen calls "pending upload".
    pub queued: usize,
    pub uploaded: usize,
    /// True when the backend could not be reached at all. Not an error: the bytes stay on disk.
    pub offline: bool,
    pub detail: String,
}

/// `upload-url` → direct `PUT` to object storage → `confirm`. The bytes never go through the API
/// (contract, *Media*), and nothing is marked uploaded until `confirm` returns 2xx — which is what
/// stops an aborted transfer from linking a truncated object.
async fn upload_to(
    dir: &Path,
    capture: &Capture,
    base_url: &str,
    credential: &str,
) -> Result<Capture, String> {
    let client = reqwest::Client::new();

    let signed: Value = client
        .post(format!("{base_url}/v1/media/upload-url"))
        .bearer_auth(credential)
        .header("X-Contract-Version", CONTRACT_VERSION)
        .json(&json!({
            "capture_id": capture.id,
            "bug_id": capture.bug_id,
            "content_type": capture.content_type,
            "byte_size": capture.total_size,
        }))
        .send()
        .await
        .map_err(|e| format!("The backend is unreachable ({e})."))?
        .error_for_status()
        .map_err(|e| format!("The backend refused an upload URL ({e})."))?
        .json()
        .await
        .map_err(|e| format!("The backend sent an upload URL we could not read ({e})."))?;

    let upload_url = signed["upload_url"]
        .as_str()
        .filter(|url| !url.is_empty())
        .ok_or("The backend's upload URL was empty.")?;

    client
        .put(upload_url)
        .header("Content-Type", &capture.content_type)
        .body(bytes(dir, &capture.id)?)
        .send()
        .await
        .map_err(|e| format!("Object storage is unreachable ({e})."))?
        .error_for_status()
        .map_err(|e| format!("Object storage refused the upload ({e})."))?;

    client
        .post(format!("{base_url}/v1/media/{}/confirm", capture.id))
        .bearer_auth(credential)
        .header("X-Contract-Version", CONTRACT_VERSION)
        .json(&json!({ "sha256": capture.sha256, "byte_size": capture.total_size }))
        .send()
        .await
        .map_err(|e| format!("The backend is unreachable ({e})."))?
        .error_for_status()
        .map_err(|e| format!("The backend did not confirm the upload ({e})."))?;

    let mut uploaded = capture.clone();
    uploaded.remote_ref = signed["remote_ref"].as_str().map(str::to_owned);
    uploaded.uploaded_at = Some(OffsetDateTime::now_utc());
    // The record the backend holds no longer matches: the confirmed capture goes back on the record
    // outbox so its `remote_ref` reaches the Bug too.
    uploaded.synced_at = None;
    save(dir, &uploaded)?;
    Ok(uploaded)
}

async fn upload(dir: &Path, capture: &Capture) -> Result<Capture, String> {
    let base_url = crate::auth_session::api_base_url()?;
    let credential = crate::auth_session::credential()
        .ok_or("Not signed in to the backend — captures stay on this machine.")?;
    upload_to(dir, capture, &base_url, &credential).await
}

/// One drain of the media outbox. Like the record outbox, an unreachable backend is a *report*: the
/// capture stays on disk, still pending, and the next tick tries again (FR-044a).
pub async fn drain(app: &AppHandle, workspace_id: &str) -> Result<MediaReport, String> {
    let dir = crate::store_path(app, DIR)?;
    let waiting = queued(&load(&dir), workspace_id);
    if waiting.is_empty() {
        return Ok(MediaReport {
            detail: "No capture is waiting to upload.".into(),
            ..MediaReport::default()
        });
    }

    let mut uploaded = 0;
    let mut failure = String::new();
    for capture in &waiting {
        match upload(&dir, capture).await {
            Ok(_) => uploaded += 1,
            Err(error) => {
                failure = error;
                // One unreachable backend means every remaining capture is also going nowhere.
                break;
            }
        }
    }

    let queued_now = waiting.len() - uploaded;
    Ok(MediaReport {
        queued: queued_now,
        uploaded,
        offline: !failure.is_empty(),
        detail: if failure.is_empty() {
            format!("Uploaded {uploaded} capture(s).")
        } else {
            format!("{failure} {queued_now} capture(s) stay queued on this machine.")
        },
    })
}

#[tauri::command]
pub fn list_captures(
    app: AppHandle,
    workspace_id: String,
    bug_id: String,
) -> Result<Vec<Capture>, String> {
    let dir = crate::store_path(app.app_handle(), DIR)?;
    Ok(load(&dir)
        .into_iter()
        .filter(|c| c.workspace_id == workspace_id && c.bug_id == bug_id)
        .collect())
}

#[tauri::command]
pub async fn upload_captures(app: AppHandle, workspace_id: String) -> Result<MediaReport, String> {
    drain(&app, &workspace_id).await
}

/// FR-044a's "queued and retried": a fixed tick of its own, independent of the record outbox.
pub fn start(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(RETRY_SECONDS)).await;
            let workspace_id = {
                let server: State<'_, WsServer> = app.state();
                server
                    .workspace_id
                    .lock()
                    .map(|id| id.clone())
                    .unwrap_or_default()
            };
            if workspace_id.is_empty() {
                continue;
            }
            if let Err(error) = drain(&app, &workspace_id).await {
                eprintln!("media outbox: {error}");
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use time::format_description::well_known::Rfc3339;
    use tokio::{
        io::{AsyncReadExt, AsyncWriteExt},
        net::TcpListener,
    };

    fn at(value: &str) -> OffsetDateTime {
        OffsetDateTime::parse(value, &Rfc3339).unwrap()
    }

    fn temp() -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "captures-test-{}",
            OffsetDateTime::now_utc().unix_timestamp_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn digest(payload: &[u8]) -> String {
        Sha256::digest(payload)
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect()
    }

    fn control(offset: u64, chunk_size: u64, total: u64, sha256: &str) -> Value {
        json!({
            "type": "media_chunk", "capture_id": "cap-1", "bug_id": "bug-1",
            "offset": offset, "chunk_size": chunk_size, "total_size": total,
            "content_type": "image/png", "sha256": sha256,
        })
    }

    async fn request(listener: &TcpListener) -> (String, Vec<u8>) {
        let (mut stream, _) = listener.accept().await.unwrap();
        let mut raw = Vec::new();
        let header_end = loop {
            let mut chunk = [0; 4096];
            let read = stream.read(&mut chunk).await.unwrap();
            assert!(read > 0, "request ended before its headers");
            raw.extend_from_slice(&chunk[..read]);
            if let Some(at) = raw.windows(4).position(|window| window == b"\r\n\r\n") {
                break at + 4;
            }
        };
        let head = String::from_utf8(raw[..header_end].to_vec()).unwrap();
        let length = head
            .lines()
            .find_map(|line| {
                let (name, value) = line.split_once(':')?;
                name.eq_ignore_ascii_case("content-length")
                    .then(|| value.trim().parse::<usize>().unwrap())
            })
            .unwrap_or(0);
        while raw.len() - header_end < length {
            let mut chunk = [0; 4096];
            let read = stream.read(&mut chunk).await.unwrap();
            assert!(read > 0, "request ended before its body");
            raw.extend_from_slice(&chunk[..read]);
        }

        let response = if head.starts_with("POST /v1/media/upload-url ") {
            let address = listener.local_addr().unwrap();
            format!(
                "{{\"upload_url\":\"http://{address}/object\",\"expires_at\":\"2026-08-10T12:00:00Z\",\"remote_ref\":\"object-1\"}}"
            )
        } else {
            String::new()
        };
        stream
            .write_all(
                format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{response}",
                    response.len()
                )
                .as_bytes(),
            )
            .await
            .unwrap();
        (head, raw[header_end..header_end + length].to_vec())
    }

    #[test]
    fn an_interrupted_transfer_resumes_at_its_offset_and_completes_only_when_the_checksum_verifies()
    {
        let dir = temp();
        let whole = b"abcdefgh";
        let sha = digest(whole);

        let first = receive(
            &dir,
            "ws-1",
            "dev-a",
            &control(0, 4, 8, &sha),
            &whole[..4],
            at("2026-08-10T10:00:00Z"),
        )
        .unwrap();
        // Half there: pending upload, and nothing is offered to the media outbox yet.
        assert_eq!(first.received, 4);
        assert!(!first.verified);
        assert!(first.pending_upload());
        assert!(queued(&load(&dir), "ws-1").is_empty());

        // The device drops and resumes: it resends the chunk it was not acked for, then the rest.
        receive(
            &dir,
            "ws-1",
            "dev-a",
            &control(0, 4, 8, &sha),
            &whole[..4],
            at("2026-08-10T10:00:05Z"),
        )
        .unwrap();
        let done = receive(
            &dir,
            "ws-1",
            "dev-a",
            &control(4, 4, 8, &sha),
            &whole[4..],
            at("2026-08-10T10:00:06Z"),
        )
        .unwrap();

        assert_eq!(done.received, 8);
        assert!(done.verified);
        assert_eq!(bytes(&dir, "cap-1").unwrap(), whole);
        // One capture, not three — a resent chunk overwrites its own bytes.
        assert_eq!(load(&dir).len(), 1);
        assert_eq!(queued(&load(&dir), "ws-1").len(), 1);
        // Another workspace's outbox never picks it up.
        assert!(queued(&load(&dir), "ws-2").is_empty());

        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_truncated_object_is_discarded_rather_than_presented_as_complete_evidence() {
        let dir = temp();
        // The device declares 8 bytes and the checksum of 8 bytes, but sends different ones.
        let sha = digest(b"abcdefgh");

        let capture = receive(
            &dir,
            "ws-1",
            "dev-a",
            &control(0, 8, 8, &sha),
            b"XXXXXXXX",
            at("2026-08-10T10:00:00Z"),
        )
        .unwrap();

        assert!(!capture.verified);
        assert_eq!(capture.received, 0);
        assert!(bytes(&dir, "cap-1").unwrap().is_empty());
        // Never offered to the backend: `confirm` can only ever link bytes that verified here.
        assert!(queued(&load(&dir), "ws-1").is_empty());
        // A capture that is still pending is still visible — evidence-in-transit, never "none".
        assert!(capture.pending_upload());
        assert_eq!(load(&dir)[0].bug_id, "bug-1");

        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_chunk_with_no_capture_id_is_refused_and_writes_nothing() {
        let dir = temp();
        let orphan = json!({ "type": "media_chunk", "bug_id": "bug-1", "offset": 0 });

        assert!(receive(
            &dir,
            "ws-1",
            "dev-a",
            &orphan,
            b"..",
            at("2026-08-10T10:00:00Z")
        )
        .is_err());
        assert!(load(&dir).is_empty());

        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_chunk_that_disagrees_with_its_control_frame_writes_nothing() {
        let dir = temp();
        let sha = digest(b"abcdefgh");

        let error = receive(
            &dir,
            "ws-1",
            "dev-a",
            &control(0, 4, 8, &sha),
            b"too-long",
            at("2026-08-10T10:00:00Z"),
        )
        .unwrap_err();

        assert!(error.contains("did not match"));
        assert!(load(&dir).is_empty());
        assert!(!blob_path(&dir, "cap-1").exists());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[tokio::test]
    async fn a_verified_capture_gets_an_upload_url_puts_its_bytes_then_confirms() {
        let dir = temp();
        let payload = b"screenshot-bytes";
        let capture = receive(
            &dir,
            "ws-1",
            "dev-a",
            &control(
                0,
                payload.len() as u64,
                payload.len() as u64,
                &digest(payload),
            ),
            payload,
            at("2026-08-10T10:00:00Z"),
        )
        .unwrap();
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base_url = format!("http://{}", listener.local_addr().unwrap());
        let serving = tokio::spawn(async move {
            let mut requests = Vec::new();
            for _ in 0..3 {
                requests.push(request(&listener).await);
            }
            requests
        });

        let uploaded = upload_to(&dir, &capture, &base_url, "session-token")
            .await
            .unwrap();
        let requests = serving.await.unwrap();

        assert!(requests[0].0.starts_with("POST /v1/media/upload-url "));
        assert!(requests[0]
            .0
            .to_ascii_lowercase()
            .contains("authorization: bearer session-token"));
        assert_eq!(
            serde_json::from_slice::<Value>(&requests[0].1).unwrap()["capture_id"],
            "cap-1"
        );
        assert!(requests[1].0.starts_with("PUT /object "));
        assert_eq!(requests[1].1, payload);
        assert!(requests[2].0.starts_with("POST /v1/media/cap-1/confirm "));
        assert_eq!(
            serde_json::from_slice::<Value>(&requests[2].1).unwrap()["sha256"],
            digest(payload)
        );
        assert_eq!(uploaded.remote_ref.as_deref(), Some("object-1"));
        assert!(uploaded.uploaded_at.is_some());
        assert!(
            uploaded.synced_at.is_none(),
            "confirmation must requeue the changed metadata"
        );
        assert_eq!(load(&dir)[0], uploaded);

        fs::remove_dir_all(&dir).unwrap();
    }
}
