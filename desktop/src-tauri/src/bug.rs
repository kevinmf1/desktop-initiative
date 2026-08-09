//! Bug records — FR-013 (the marker) and FR-030…032 (the record it becomes).
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
//! FR-030's remaining fields are **triage**, not capture: marking stays one field (FR-013), and
//! severity, status, description and the case a bug belongs to are set afterwards through `edit`.
//! Everything that was already true of the run — plan, build version, environment — is copied off
//! the session at mark time, so it is right even if the session row is edited later.
//!
//! ponytail: same one-JSON-file store as `test_session.rs`, same ceiling, same upgrade path.

use std::fs;

use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use time::{Duration, OffsetDateTime};

use crate::test_session::{self, TestSession};

const STORE_FILE: &str = "bugs.json";

/// FR-032's default. Per-bug and editable — `window_seconds` on the record is the configuration,
/// so widening a window re-reads the session's frames instead of needing them re-captured.
pub const WINDOW_SECONDS: i64 = 30;

/// An hour either side is already far past "around the event"; beyond it the excerpt stops being
/// evidence and becomes the whole log, which the Log Inspector already shows.
const MAX_WINDOW_SECONDS: i64 = 3600;

fn default_window() -> i64 {
    WINDOW_SECONDS
}

/// FR-030a.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
pub enum Severity {
    P0,
    P1,
    /// A bug marked mid-run has not been triaged yet; P2 says "recorded, not yet judged" rather
    /// than asserting an urgency nobody chose.
    #[default]
    P2,
    P3,
}

/// FR-030b. The wire spelling is the spelling the spec uses — the webview renders it verbatim.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
pub enum Status {
    #[default]
    Open,
    #[serde(rename = "In Progress")]
    InProgress,
    Resolved,
    Closed,
    #[serde(rename = "Won't Fix")]
    WontFix,
}

/// FR-030. `serde(default)` on everything feat-019 did not write is what lets a `bugs.json` from
/// before this feature load as a valid, untriaged record instead of failing the whole store.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Bug {
    pub id: String,
    pub workspace_id: String,
    pub test_session_id: String,
    /// SDK-reported stable device id, copied off the session so the marker still resolves after the
    /// session row is edited or the device is renamed.
    pub device_id: String,
    #[serde(alias = "summary")]
    pub title: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub severity: Severity,
    #[serde(default)]
    pub status: Status,
    #[serde(default)]
    pub test_case_id: Option<String>,
    /// Copied off the session — the plan the run was scoped by, not a second, editable opinion.
    #[serde(default)]
    pub test_plan_id: Option<String>,
    #[serde(default)]
    pub build_version: String,
    #[serde(default)]
    pub environment: String,
    pub marked_by: String,
    #[serde(with = "time::serde::rfc3339")]
    pub marked_at: OffsetDateTime,
    /// FR-032: the window is `marked_at ± this`, so the two timestamps below are always derivable
    /// and never drift away from the number the operator set.
    #[serde(default = "default_window")]
    pub window_seconds: i64,
    #[serde(with = "time::serde::rfc3339")]
    pub window_start: OffsetDateTime,
    #[serde(with = "time::serde::rfc3339")]
    pub window_end: OffsetDateTime,
    /// FR-035b: when this record last reached the backend. `None` is the outbox — a bug is written
    /// locally first and always, and syncing is what happens *afterwards*, if and when it can.
    #[serde(default, with = "time::serde::rfc3339::option")]
    pub synced_at: Option<OffsetDateTime>,
}

/// A triage patch. Every field is optional: absent means "leave it", which is what makes a
/// one-control edit on the screen a one-field payload rather than a full-record overwrite that
/// could clobber a change made from another card.
#[derive(Debug, Clone, Default, Deserialize)]
pub struct BugEdit {
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub severity: Option<Severity>,
    #[serde(default)]
    pub status: Option<Status>,
    /// Absent leaves the link; `""` clears it. ponytail: an empty id is not a valid id anywhere in
    /// this store, so it can carry "none" without a second Option layer.
    #[serde(default)]
    pub test_case_id: Option<String>,
    #[serde(default)]
    pub window_seconds: Option<i64>,
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
    title: &str,
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
        title: match title.trim() {
            "" => "Bug occurred".into(),
            named => named.into(),
        },
        description: String::new(),
        severity: Severity::default(),
        status: Status::default(),
        test_case_id: None,
        test_plan_id: session.test_plan_id.clone(),
        build_version: session.build_version.clone(),
        environment: session.server.clone(),
        marked_by: marked_by.into(),
        marked_at: now,
        window_seconds: WINDOW_SECONDS,
        window_start: now - window,
        window_end: now + window,
        synced_at: None,
    };
    bugs.push(bug.clone());
    Ok(bug)
}

/// FR-030 / FR-030a / FR-030b / FR-032: triage. The marker's own facts — when, who, which session,
/// which device, which build — are *not* editable: they are what was observed, and a record whose
/// observation can be rewritten is not evidence.
pub fn edit(
    bugs: &mut [Bug],
    workspace_id: &str,
    id: &str,
    patch: BugEdit,
) -> Result<Bug, String> {
    let bug = bugs
        .iter_mut()
        .find(|bug| bug.id == id && bug.workspace_id == workspace_id)
        .ok_or("That bug no longer exists.")?;

    if let Some(title) = patch.title {
        match title.trim() {
            "" => return Err("A bug needs a title.".into()),
            named => bug.title = named.into(),
        }
    }
    if let Some(description) = patch.description {
        bug.description = description.trim().into();
    }
    if let Some(severity) = patch.severity {
        bug.severity = severity;
    }
    if let Some(status) = patch.status {
        bug.status = status;
    }
    if let Some(test_case_id) = patch.test_case_id {
        bug.test_case_id = match test_case_id.trim() {
            "" => None,
            picked => Some(picked.into()),
        };
    }
    if let Some(seconds) = patch.window_seconds {
        if !(1..=MAX_WINDOW_SECONDS).contains(&seconds) {
            return Err(format!(
                "The evidence window must be between 1 and {MAX_WINDOW_SECONDS} seconds."
            ));
        }
        // Recomputed from `marked_at`, never from the previous bounds — so repeated edits cannot
        // drift the window off the moment it is supposed to be centred on.
        let window = Duration::seconds(seconds);
        bug.window_seconds = seconds;
        bug.window_start = bug.marked_at - window;
        bug.window_end = bug.marked_at + window;
    }
    // Triage changed the record, so the copy the backend holds is stale: back into the outbox.
    bug.synced_at = None;
    Ok(bug.clone())
}

pub(crate) fn load(app: &AppHandle) -> Result<Vec<Bug>, String> {
    let path = crate::store_path(app, STORE_FILE)?;
    match fs::read_to_string(&path) {
        Ok(raw) => serde_json::from_str(&raw)
            .map_err(|e| format!("{} is not readable: {e}", path.display())),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Vec::new()),
        Err(e) => Err(format!("Could not read {}: {e}", path.display())),
    }
}

pub(crate) fn save(app: &AppHandle, bugs: &[Bug]) -> Result<(), String> {
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

#[tauri::command]
pub fn update_bug(
    app: AppHandle,
    workspace_id: String,
    id: String,
    patch: BugEdit,
) -> Result<Bug, String> {
    let mut bugs = load(&app)?;
    let edited = edit(&mut bugs, &workspace_id, &id, patch)?;
    save(&app, &bugs)?;
    Ok(edited)
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
            synced_at: None,
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

        assert_eq!(bug.title, "Checkout 500s");
        // FR-030: what was already true of the run is copied, not asked for again.
        assert_eq!(bug.build_version, "2.4.1");
        assert_eq!(bug.environment, "staging");
        assert_eq!(bug.test_plan_id, None);
        // FR-030a / FR-030b: a fresh marker is Open and untriaged.
        assert_eq!(bug.severity, Severity::P2);
        assert_eq!(bug.status, Status::Open);
        assert_eq!(bug.window_seconds, 30);
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
        assert_eq!(first.title, "Bug occurred");
        assert_eq!(bugs.len(), 2);
    }

    fn marked() -> Vec<Bug> {
        let mut bugs = vec![];
        mark(&mut bugs, &[session(false)], "ws-1", "ts-1", "Checkout 500s", "Kevin", at("2026-08-10T10:15:00Z"))
            .unwrap();
        bugs
    }

    #[test]
    fn triage_sets_the_record_and_a_wider_window_stays_centred_on_the_marker() {
        let mut bugs = marked();
        let marked_id = bugs[0].id.clone();

        let bug = edit(
            &mut bugs,
            "ws-1",
            &marked_id,
            BugEdit {
                description: Some("  500 on POST /checkout  ".into()),
                severity: Some(Severity::P0),
                status: Some(Status::InProgress),
                test_case_id: Some("tc-1".into()),
                window_seconds: Some(120),
                ..BugEdit::default()
            },
        )
        .unwrap();

        assert_eq!(bug.description, "500 on POST /checkout");
        assert_eq!(bug.severity, Severity::P0);
        assert_eq!(bug.status, Status::InProgress);
        assert_eq!(bug.test_case_id.as_deref(), Some("tc-1"));
        assert_eq!(bug.window_seconds, 120);
        assert_eq!(bug.window_start, at("2026-08-10T10:13:00Z"));
        assert_eq!(bug.window_end, at("2026-08-10T10:17:00Z"));
        // Narrowing again re-derives from `marked_at`, so windows never drift.
        let id = bug.id.clone();
        let back = edit(&mut bugs, "ws-1", &id, BugEdit { window_seconds: Some(5), ..BugEdit::default() }).unwrap();
        assert_eq!(back.window_start, at("2026-08-10T10:14:55Z"));
        assert_eq!(back.window_end, at("2026-08-10T10:15:05Z"));
        // The observation itself is not editable — no patch field can reach it.
        assert_eq!(back.marked_at, at("2026-08-10T10:15:00Z"));
        assert_eq!(back.test_session_id, "ts-1");
        // FR-030b's full set round-trips on the wire as the spec spells it.
        let raw = serde_json::to_string(&Status::WontFix).unwrap();
        assert_eq!(raw, "\"Won't Fix\"");
        assert_eq!(serde_json::to_string(&Status::InProgress).unwrap(), "\"In Progress\"");
    }

    #[test]
    fn triage_refuses_a_stranger_a_blank_title_and_an_out_of_range_window() {
        let mut bugs = marked();
        let id = bugs[0].id.clone();

        assert_eq!(
            edit(&mut bugs, "ws-2", &id, BugEdit::default()).unwrap_err(),
            "That bug no longer exists."
        );
        assert_eq!(
            edit(&mut bugs, "ws-1", &id, BugEdit { title: Some("   ".into()), ..BugEdit::default() }).unwrap_err(),
            "A bug needs a title."
        );
        for seconds in [0, -30, MAX_WINDOW_SECONDS + 1] {
            assert!(edit(&mut bugs, "ws-1", &id, BugEdit { window_seconds: Some(seconds), ..BugEdit::default() })
                .unwrap_err()
                .starts_with("The evidence window must be"));
        }
        assert_eq!(bugs[0].title, "Checkout 500s");
        assert_eq!(bugs[0].window_seconds, 30);
    }

    #[test]
    fn a_bug_written_before_this_feature_loads_as_an_untriaged_record() {
        // Exactly what feat-019 wrote — no severity, no status, `summary` not `title`.
        let raw = r#"[{
            "id": "bug-1", "workspace_id": "ws-1", "test_session_id": "ts-1", "device_id": "dev-a",
            "summary": "Checkout 500s", "marked_by": "Kevin",
            "marked_at": "2026-08-10T10:15:00Z",
            "window_start": "2026-08-10T10:14:30Z", "window_end": "2026-08-10T10:15:30Z"
        }]"#;

        let bugs: Vec<Bug> = serde_json::from_str(raw).unwrap();

        assert_eq!(bugs[0].title, "Checkout 500s");
        assert_eq!(bugs[0].status, Status::Open);
        assert_eq!(bugs[0].severity, Severity::P2);
        assert_eq!(bugs[0].window_seconds, WINDOW_SECONDS);
    }
}
