//! "Bug Occurred" markers — FR-013.
//!
//! A marker is the operator saying *this moment* mattered, while the run continues. Three things
//! make that true here:
//!
//! - it takes `&[TestSession]`, never `&mut` — a marker **cannot** end a session, by type;
//! - it bookmarks a window `[marked_at - W, marked_at + W]` rather than copying records, so the
//!   frames it points at are whatever the session actually streamed, before *and* after the click;
//! - it carries `(device_id, session_id)` — the same pair `ws::server::Sessions` files records
//!   under (CONSTITUTION 2026-08-10), so the window resolves without a translation table.
//!
//! Scope: feat-020 owns the full bug record (severity, status, log excerpt, preceding User Actions,
//! a *configurable* window). This module owns the marker and nothing else.
//!
//! ponytail: same one-JSON-file store as `test_session.rs`, same ceiling, same upgrade path.

use std::fs;

use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use time::{Duration, OffsetDateTime};

use crate::test_session::{self, TestSession};

const STORE_FILE: &str = "bugs.json";

/// FR-030b's ±30s, fixed here. feat-020 makes it configurable — the field is already per-bug, so
/// that lands as an input, not a migration.
pub const WINDOW_SECONDS: i64 = 30;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Bug {
    pub id: String,
    pub workspace_id: String,
    pub test_session_id: String,
    /// SDK-reported stable device id, copied off the session so the marker still resolves after the
    /// session row is edited or the device is renamed.
    pub device_id: String,
    pub summary: String,
    pub marked_by: String,
    #[serde(with = "time::serde::rfc3339")]
    pub marked_at: OffsetDateTime,
    #[serde(with = "time::serde::rfc3339")]
    pub window_start: OffsetDateTime,
    #[serde(with = "time::serde::rfc3339")]
    pub window_end: OffsetDateTime,
}

pub fn visible(bugs: &[Bug], workspace_id: &str) -> Vec<Bug> {
    bugs.iter()
        .filter(|bug| bug.workspace_id == workspace_id)
        .cloned()
        .collect()
}

/// FR-013. Refuses a session that is not running: a marker is a live-session act, and one recorded
/// against a judged run would claim activity that was never captured.
pub fn mark(
    bugs: &mut Vec<Bug>,
    sessions: &[TestSession],
    workspace_id: &str,
    test_session_id: &str,
    summary: &str,
    marked_by: &str,
    now: OffsetDateTime,
) -> Result<Bug, String> {
    let session = sessions
        .iter()
        .find(|s| s.id == test_session_id && s.workspace_id == workspace_id)
        .ok_or("That session no longer exists.")?;
    if !session.is_running() {
        return Err("That session has been stopped — a bug marker needs a running session.".into());
    }

    // Same collision guard as a session id: the clock is the source, the suffix settles a tie.
    let stem = format!("bug-{}", now.unix_timestamp_nanos());
    let mut id = stem.clone();
    let mut suffix = 1;
    while bugs.iter().any(|bug| bug.id == id) {
        id = format!("{stem}-{suffix}");
        suffix += 1;
    }

    let window = Duration::seconds(WINDOW_SECONDS);
    let bug = Bug {
        id,
        workspace_id: workspace_id.into(),
        test_session_id: session.id.clone(),
        device_id: session.device_id.clone(),
        summary: match summary.trim() {
            "" => "Bug occurred".into(),
            named => named.into(),
        },
        marked_by: marked_by.into(),
        marked_at: now,
        window_start: now - window,
        window_end: now + window,
    };
    bugs.push(bug.clone());
    Ok(bug)
}

fn load(app: &AppHandle) -> Result<Vec<Bug>, String> {
    let path = crate::store_path(app, STORE_FILE)?;
    match fs::read_to_string(&path) {
        Ok(raw) => serde_json::from_str(&raw)
            .map_err(|e| format!("{} is not readable: {e}", path.display())),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Vec::new()),
        Err(e) => Err(format!("Could not read {}: {e}", path.display())),
    }
}

fn save(app: &AppHandle, bugs: &[Bug]) -> Result<(), String> {
    let path = crate::store_path(app, STORE_FILE)?;
    let raw = serde_json::to_string_pretty(bugs).map_err(|e| e.to_string())?;
    fs::write(&path, raw).map_err(|e| format!("Could not write {}: {e}", path.display()))
}

#[tauri::command]
pub fn list_bugs(app: AppHandle, workspace_id: String) -> Result<Vec<Bug>, String> {
    Ok(visible(&load(&app)?, &workspace_id))
}

#[tauri::command]
pub fn mark_bug(
    app: AppHandle,
    workspace_id: String,
    test_session_id: String,
    summary: String,
) -> Result<Bug, String> {
    let mut bugs = load(&app)?;
    let marked = mark(
        &mut bugs,
        &test_session::load(&app)?,
        &workspace_id,
        &test_session_id,
        &summary,
        &crate::test_case::actor(),
        OffsetDateTime::now_utc(),
    )?;
    save(&app, &bugs)?;
    Ok(marked)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::device::ObservedPlatform;
    use time::format_description::well_known::Rfc3339;

    fn at(value: &str) -> OffsetDateTime {
        OffsetDateTime::parse(value, &Rfc3339).unwrap()
    }

    fn session(stopped: bool) -> TestSession {
        TestSession {
            id: "ts-1".into(),
            workspace_id: "ws-1".into(),
            test_plan_id: None,
            device_id: "dev-a".into(),
            name: "Regression".into(),
            started_by: "Kevin".into(),
            started_at: at("2026-08-10T10:00:00Z"),
            stopped_at: stopped.then(|| at("2026-08-10T10:30:00Z")),
            build_version: "2.4.1".into(),
            platform: ObservedPlatform::Android,
            server: "staging".into(),
            result: None,
            case_ids: vec!["tc-1".into()],
        }
    }

    #[test]
    fn a_marker_bookmarks_a_window_and_leaves_the_session_running() {
        let sessions = vec![session(false)];
        let mut bugs = vec![];

        let bug = mark(
            &mut bugs,
            &sessions,
            "ws-1",
            "ts-1",
            "  Checkout 500s  ",
            "Kevin",
            at("2026-08-10T10:15:00Z"),
        )
        .unwrap();

        assert_eq!(bug.summary, "Checkout 500s");
        assert_eq!(bug.marked_at, at("2026-08-10T10:15:00Z"));
        assert_eq!(bug.window_start, at("2026-08-10T10:14:30Z"));
        assert_eq!(bug.window_end, at("2026-08-10T10:15:30Z"));
        assert_eq!(bug.device_id, "dev-a");
        assert_eq!(bug.test_session_id, "ts-1");
        // FR-013: the run continues. `mark` never had a mutable session to end.
        assert!(sessions[0].is_running());
        assert_eq!(visible(&bugs, "ws-1").len(), 1);
        assert!(visible(&bugs, "ws-2").is_empty());
    }

    #[test]
    fn a_marker_needs_a_running_session_in_this_workspace() {
        let mut bugs = vec![];

        assert_eq!(
            mark(&mut bugs, &[], "ws-1", "ts-1", "", "Kevin", at("2026-08-10T10:15:00Z")).unwrap_err(),
            "That session no longer exists."
        );
        assert_eq!(
            mark(&mut bugs, &[session(false)], "ws-2", "ts-1", "", "Kevin", at("2026-08-10T10:15:00Z"))
                .unwrap_err(),
            "That session no longer exists."
        );
        assert_eq!(
            mark(&mut bugs, &[session(true)], "ws-1", "ts-1", "", "Kevin", at("2026-08-10T10:40:00Z"))
                .unwrap_err(),
            "That session has been stopped — a bug marker needs a running session."
        );
        assert!(bugs.is_empty());
    }

    #[test]
    fn two_markers_on_one_clock_tick_still_get_distinct_ids_and_a_default_summary() {
        let sessions = vec![session(false)];
        let mut bugs = vec![];

        let first = mark(&mut bugs, &sessions, "ws-1", "ts-1", "", "Kevin", at("2026-08-10T10:15:00Z")).unwrap();
        let second = mark(&mut bugs, &sessions, "ws-1", "ts-1", "", "Kevin", at("2026-08-10T10:15:00Z")).unwrap();

        assert_ne!(first.id, second.id);
        assert_eq!(first.summary, "Bug occurred");
        assert_eq!(bugs.len(), 2);
    }
}
