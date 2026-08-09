//! The durable frame log — FR-035b's "local-first", FR-036's de-duplication.
//!
//! Everything a device streams is appended to **one JSONL file per device**, each line carrying the
//! session it belonged to. Three consequences, and they are the whole reason for the shape:
//!
//! - a bug's evidence window is re-read from disk, so it survives a restart *and* stays derived —
//!   widening a window still re-reads frames rather than needing them re-captured (FR-032);
//! - clearing the general logs is `retain`, which rewrites the file keeping only what falls inside
//!   a bug's window, so clearing can never empty evidence already captured (FR-035b);
//! - one file per device means a session's frames are a filter, not a filename — nothing has to
//!   enumerate the directory to find which sessions a device ever ran.
//!
//! ponytail: append-only JSONL, read whole on every poll. It is O(file) per read, which is fine at
//! bench scale; if a soak makes the Log Inspector's 1s tick visible, the upgrade is an offset index
//! or SQLite behind this same four-function API.

use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use time::{format_description::well_known::Rfc3339, OffsetDateTime};

pub const DIR: &str = "frames";

/// One stored line: the frame as it came off the wire, plus the session it was filed under. The
/// session travels beside the frame because `user_action` may omit `session_id` (contract), and the
/// server's "current session" is the only place that knows it.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Stored {
    pub session_id: String,
    pub frame: Value,
}

/// A device id is user-supplied and reaches the filesystem, so it is hashed rather than sanitised —
/// no traversal, no case-folding surprise, no two devices slugging to one file.
fn device_file(dir: &Path, device_id: &str) -> PathBuf {
    let digest = Sha256::digest(device_id.as_bytes());
    dir.join(format!("{}.jsonl", hex(&digest[..8])))
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

/// FR-036: what makes two deliveries *the same event*. The contract names the key per type —
/// `request_id`+`phase` for a log event, and the matching id for the others.
///
/// `None` means "this frame carries no identity", and an unidentifiable frame is never treated as a
/// replay: dropping it would lose a real record on the strength of a guess.
pub fn identity(frame: &Value) -> Option<String> {
    let text = |key: &str| frame.get(key).and_then(Value::as_str).filter(|v| !v.is_empty());
    let kind = text("type")?;
    let key = match kind {
        "log_event" => format!("{}|{}", text("request_id")?, text("phase").unwrap_or_default()),
        "app_log" => text("log_id")?.to_owned(),
        "user_action" => text("action_id")?.to_owned(),
        "crash_report" => text("crash_id")?.to_owned(),
        "media_chunk" => format!(
            "{}|{}",
            text("capture_id")?,
            frame.get("offset").and_then(Value::as_i64).unwrap_or_default()
        ),
        _ => return None,
    };
    Some(format!("{kind}|{key}"))
}

/// The frame's own timestamp, read from the same contract fields the webview's `logRow` reads. A
/// frame the contract gave no timestamp cannot be placed in a window — the caller decides what that
/// means, and for evidence it means "left out rather than guessed in" (FR-031).
pub fn occurred_at(frame: &Value) -> Option<OffsetDateTime> {
    ["started_at", "logged_at", "occurred_at", "crashed_at"]
        .iter()
        .find_map(|key| frame.get(*key).and_then(Value::as_str))
        .and_then(|raw| OffsetDateTime::parse(raw, &Rfc3339).ok())
}

pub fn append(dir: &Path, device_id: &str, session_id: &str, frame: &Value) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|e| format!("Could not create {}: {e}", dir.display()))?;
    let line = serde_json::to_string(&Stored {
        session_id: session_id.to_owned(),
        frame: frame.clone(),
    })
    .map_err(|e| e.to_string())?;
    let path = device_file(dir, device_id);
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| format!("Could not open {}: {e}", path.display()))?;
    writeln!(file, "{line}").map_err(|e| format!("Could not write {}: {e}", path.display()))
}

/// Every frame this device streamed, oldest first. A line we can no longer parse is skipped rather
/// than failing the read — one bad line must not cost the operator the whole log (FR-036).
pub fn read(dir: &Path, device_id: &str) -> Vec<Stored> {
    let path = device_file(dir, device_id);
    let Ok(raw) = fs::read_to_string(&path) else {
        return Vec::new();
    };
    raw.lines()
        .filter(|line| !line.trim().is_empty())
        .filter_map(|line| match serde_json::from_str::<Stored>(line) {
            Ok(stored) => Some(stored),
            Err(error) => {
                eprintln!("frames: skipped an unreadable line in {}: {error}", path.display());
                None
            }
        })
        .collect()
}

pub fn session(dir: &Path, device_id: &str, session_id: &str) -> Vec<Value> {
    read(dir, device_id)
        .into_iter()
        .filter(|stored| stored.session_id == session_id)
        .map(|stored| stored.frame)
        .collect()
}

/// FR-035b: clearing the general logs. Keeps exactly the frames that fall inside one of the given
/// windows — a bug's already-captured evidence — and drops the rest.
///
/// A frame with no readable timestamp is dropped: it could not have been *in* a window, so keeping
/// it would be keeping the general log the operator asked to clear.
pub fn retain(
    dir: &Path,
    device_id: &str,
    windows: &[(OffsetDateTime, OffsetDateTime)],
) -> Result<usize, String> {
    let kept: Vec<Stored> = read(dir, device_id)
        .into_iter()
        .filter(|stored| {
            occurred_at(&stored.frame).is_some_and(|at| {
                windows.iter().any(|(from, to)| at >= *from && at <= *to)
            })
        })
        .collect();

    let path = device_file(dir, device_id);
    if kept.is_empty() {
        return match fs::remove_file(&path) {
            Ok(()) => Ok(0),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(0),
            Err(e) => Err(format!("Could not clear {}: {e}", path.display())),
        };
    }

    let mut body = String::new();
    for stored in &kept {
        body.push_str(&serde_json::to_string(stored).map_err(|e| e.to_string())?);
        body.push('\n');
    }
    fs::write(&path, body).map_err(|e| format!("Could not write {}: {e}", path.display()))?;
    Ok(kept.len())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn at(value: &str) -> OffsetDateTime {
        OffsetDateTime::parse(value, &Rfc3339).unwrap()
    }

    fn temp() -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "frames-test-{}",
            OffsetDateTime::now_utc().unix_timestamp_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn log_event(request_id: &str, phase: &str, at: &str) -> Value {
        json!({ "type": "log_event", "request_id": request_id, "phase": phase, "started_at": at })
    }

    #[test]
    fn the_same_event_delivered_twice_has_one_identity_and_a_later_phase_has_another() {
        let first = log_event("req-1", "started", "2026-08-10T10:00:00Z");
        let replay = log_event("req-1", "started", "2026-08-10T10:00:00Z");
        let completed = log_event("req-1", "completed", "2026-08-10T10:00:01Z");

        assert_eq!(identity(&first), identity(&replay));
        assert_ne!(identity(&first), identity(&completed));
        assert_eq!(
            identity(&json!({ "type": "user_action", "action_id": "a-1" })),
            Some("user_action|a-1".into())
        );
        // No identity → never a replay: heartbeats, unknown types, and a frame missing its own id.
        assert_eq!(identity(&json!({ "type": "heartbeat" })), None);
        assert_eq!(identity(&json!({ "type": "log_event", "phase": "started" })), None);
        assert_eq!(identity(&json!({ "type": "app_log", "log_id": "" })), None);
    }

    #[test]
    fn frames_survive_being_written_and_are_readable_per_session_and_per_device() {
        let dir = temp();
        append(&dir, "dev-a", "s-1", &log_event("req-1", "started", "2026-08-10T10:00:00Z")).unwrap();
        append(&dir, "dev-a", "s-2", &log_event("req-2", "started", "2026-08-10T10:05:00Z")).unwrap();
        append(&dir, "dev-b", "s-9", &log_event("req-9", "started", "2026-08-10T10:06:00Z")).unwrap();

        // A restart is exactly this: nothing in memory, everything read back off disk.
        assert_eq!(read(&dir, "dev-a").len(), 2);
        assert_eq!(session(&dir, "dev-a", "s-1").len(), 1);
        assert_eq!(session(&dir, "dev-a", "s-2")[0]["request_id"], "req-2");
        // One device's log is never another's, and an unknown device reads empty rather than failing.
        assert_eq!(read(&dir, "dev-b").len(), 1);
        assert!(read(&dir, "dev-never-seen").is_empty());

        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn clearing_the_logs_keeps_a_bugs_window_and_drops_everything_else() {
        let dir = temp();
        for (request, at) in [
            ("before", "2026-08-10T10:00:00Z"),
            ("inside", "2026-08-10T10:14:45Z"),
            ("marker", "2026-08-10T10:15:10Z"),
            ("after", "2026-08-10T11:00:00Z"),
        ] {
            append(&dir, "dev-a", "s-1", &log_event(request, "completed", at)).unwrap();
        }
        // A frame the contract gave no timestamp: it cannot be placed in the window.
        append(&dir, "dev-a", "s-1", &json!({ "type": "app_log", "log_id": "l-1", "message": "no clock" })).unwrap();

        let window = (at("2026-08-10T10:14:30Z"), at("2026-08-10T10:15:30Z"));
        assert_eq!(retain(&dir, "dev-a", &[window]).unwrap(), 2);

        let left: Vec<String> = read(&dir, "dev-a")
            .iter()
            .map(|stored| stored.frame["request_id"].as_str().unwrap_or_default().to_owned())
            .collect();
        assert_eq!(left, ["inside", "marker"]);
        // Clearing with no bug at all leaves nothing behind.
        assert_eq!(retain(&dir, "dev-a", &[]).unwrap(), 0);
        assert!(read(&dir, "dev-a").is_empty());

        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn one_unreadable_line_costs_that_line_and_not_the_log() {
        let dir = temp();
        append(&dir, "dev-a", "s-1", &log_event("req-1", "started", "2026-08-10T10:00:00Z")).unwrap();
        let path = device_file(&dir, "dev-a");
        let mut file = OpenOptions::new().append(true).open(&path).unwrap();
        writeln!(file, "{{ not json").unwrap();
        drop(file);
        append(&dir, "dev-a", "s-1", &log_event("req-2", "started", "2026-08-10T10:00:01Z")).unwrap();

        let stored = read(&dir, "dev-a");
        assert_eq!(stored.len(), 2);
        assert_eq!(stored[1].frame["request_id"], "req-2");

        fs::remove_dir_all(&dir).unwrap();
    }
}
