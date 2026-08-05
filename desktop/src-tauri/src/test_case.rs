//! Test Case store — the canonical, reusable content a Test Plan links to (FR-003…FR-003c).
//!
//! Three rules shape this module:
//!
//! - **Run status is never stored** (FR-003, FR-003a). Nothing here holds a Passed/Failed/Blocked
//!   field. The summary status a row shows is computed on read from the case's per-plan instances,
//!   in the webview (`summaryStatus` in `src/TestCases.tsx`), and the instances themselves belong
//!   to Test Plan Item (feat-012). A `status` column would make the derived value stale by
//!   construction, which is exactly what FR-003a forbids.
//! - **`lifecycle` is independent of run outcome** (FR-003b). Archiving a case says nothing about
//!   whether it passed.
//! - **Delete is soft** (FR-006). `deleted_at` is set and the row stops being listed, so a
//!   historical Session Case Result or Bug that references it still resolves.
//!
//! ponytail: one JSON file under the app data dir, rewritten whole on every write. research.md R2
//! picks SQLite via `rusqlite` for the local store — that lands with **feat-023**, which needs what
//! SQLite is actually for: transactional writes behind the sync outbox, log events spilling out of
//! the in-memory ring, and the reporting queries of FR-033/034. None of that exists yet, and a
//! test-case list is a few hundred rows. Ceiling: whole-file rewrite is O(n) per save and not
//! concurrent-safe across processes. Upgrade path: feat-023 replaces `load`/`save` with a rusqlite
//! table and reads this file once to migrate.

use std::{fs, path::PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use time::OffsetDateTime;

const STORE_FILE: &str = "test-cases.json";

/// FR-003c: a Test Case's platform is one of exactly these. As an enum, a payload carrying
/// anything else fails to deserialize instead of being stored and shown later.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Platform {
    #[serde(rename = "iOS")]
    IOs,
    Android,
    Both,
}

/// FR-003b: the Active/Archived lifecycle flag, separate from any run outcome.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
pub enum Lifecycle {
    #[default]
    Active,
    Archived,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TestCase {
    pub id: String,
    pub workspace_id: String,
    pub title: String,
    #[serde(default)]
    pub description: String,
    pub platform: Platform,
    #[serde(default)]
    pub server: String,
    #[serde(default)]
    pub lifecycle: Lifecycle,
    /// ponytail: tag names inline rather than a normalised Tag table. FR-004's tag *filter* is
    /// feat-010; it filters these strings. Promote to a Tag entity when renaming a tag everywhere
    /// becomes a requirement.
    #[serde(default)]
    pub tags: Vec<String>,
    // FR-005: audit metadata, updated on every edit.
    pub created_by: String,
    #[serde(with = "time::serde::rfc3339")]
    pub created_at: OffsetDateTime,
    pub updated_by: String,
    #[serde(with = "time::serde::rfc3339")]
    pub updated_at: OffsetDateTime,
    /// FR-006: soft delete. `Some` means hidden from lists but still resolvable from history.
    #[serde(default, with = "time::serde::rfc3339::option")]
    pub deleted_at: Option<OffsetDateTime>,
}

/// What the webview sends. No audit fields and no status: the store owns the former and nothing
/// owns the latter. An absent `id` means create, a known `id` means edit.
#[derive(Debug, Clone, Deserialize)]
pub struct TestCaseInput {
    #[serde(default)]
    pub id: Option<String>,
    pub title: String,
    #[serde(default)]
    pub description: String,
    pub platform: Platform,
    #[serde(default)]
    pub server: String,
    #[serde(default)]
    pub lifecycle: Lifecycle,
    #[serde(default)]
    pub tags: Vec<String>,
}

/// FR-001: every read is scoped to the active workspace, and a soft-deleted case is not listed.
pub fn visible(cases: &[TestCase], workspace_id: &str) -> Vec<TestCase> {
    cases
        .iter()
        .filter(|c| c.workspace_id == workspace_id && c.deleted_at.is_none())
        .cloned()
        .collect()
}

/// Create or edit in place. FR-005: `created_*` survives an edit, `updated_*` always moves.
/// Returns the stored case.
pub fn upsert(
    cases: &mut Vec<TestCase>,
    workspace_id: &str,
    input: TestCaseInput,
    actor: &str,
    now: OffsetDateTime,
) -> Result<TestCase, String> {
    if input.title.trim().is_empty() {
        return Err("A Test Case needs a title.".into());
    }
    // FR-008 allows duplicate titles, so nothing here dedupes on title.
    let existing = input.id.as_deref().and_then(|id| {
        cases
            .iter()
            .position(|c| c.id == id && c.workspace_id == workspace_id)
    });

    let case = TestCase {
        id: input.id.clone().unwrap_or_else(|| new_id(now)),
        workspace_id: workspace_id.to_string(),
        title: input.title.trim().to_string(),
        description: input.description,
        platform: input.platform,
        server: input.server,
        lifecycle: input.lifecycle,
        tags: input.tags,
        created_by: existing
            .map(|i| cases[i].created_by.clone())
            .unwrap_or_else(|| actor.to_string()),
        created_at: existing.map(|i| cases[i].created_at).unwrap_or(now),
        updated_by: actor.to_string(),
        updated_at: now,
        deleted_at: existing.and_then(|i| cases[i].deleted_at),
    };

    match existing {
        Some(i) => cases[i] = case.clone(),
        // A supplied id that matches nothing in this workspace is a write into another workspace's
        // data or a stale row — refuse rather than resurrect it here.
        None if input.id.is_some() => return Err("That Test Case no longer exists.".into()),
        None => cases.push(case.clone()),
    }
    Ok(case)
}

/// FR-006: soft delete. The row is kept so historical references stay viewable.
pub fn soft_delete(
    cases: &mut [TestCase],
    workspace_id: &str,
    id: &str,
    now: OffsetDateTime,
) -> Result<(), String> {
    let case = cases
        .iter_mut()
        .find(|c| c.id == id && c.workspace_id == workspace_id)
        .ok_or("That Test Case no longer exists.")?;
    case.deleted_at.get_or_insert(now);
    Ok(())
}

/// ponytail: timestamp-based id, so no uuid dependency. Nanosecond resolution from a single
/// process; the backend assigns the synced id at feat-023.
fn new_id(now: OffsetDateTime) -> String {
    format!("tc-{}", now.unix_timestamp_nanos())
}

fn store_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("No app data directory: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("Could not create {}: {e}", dir.display()))?;
    Ok(dir.join(STORE_FILE))
}

pub(crate) fn load(app: &AppHandle) -> Result<Vec<TestCase>, String> {
    let path = store_path(app)?;
    match fs::read_to_string(&path) {
        Ok(raw) => serde_json::from_str(&raw)
            .map_err(|e| format!("{} is not readable: {e}", path.display())),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Vec::new()),
        Err(e) => Err(format!("Could not read {}: {e}", path.display())),
    }
}

fn save(app: &AppHandle, cases: &[TestCase]) -> Result<(), String> {
    let path = store_path(app)?;
    let raw = serde_json::to_string_pretty(cases).map_err(|e| e.to_string())?;
    fs::write(&path, raw).map_err(|e| format!("Could not write {}: {e}", path.display()))
}

/// Whose name lands in the audit fields. Comes from the cached Auth Session, never from the
/// webview — the caller must not be able to claim authorship of somebody else's edit.
fn actor() -> String {
    crate::auth_session::cached_account()
        .ok()
        .flatten()
        .map(|a| a.user.display_name)
        .unwrap_or_else(|| "unknown".into())
}

#[tauri::command]
pub fn list_test_cases(app: AppHandle, workspace_id: String) -> Result<Vec<TestCase>, String> {
    Ok(visible(&load(&app)?, &workspace_id))
}

#[tauri::command]
pub fn save_test_case(
    app: AppHandle,
    workspace_id: String,
    input: TestCaseInput,
) -> Result<TestCase, String> {
    let mut cases = load(&app)?;
    let saved = upsert(
        &mut cases,
        &workspace_id,
        input,
        &actor(),
        OffsetDateTime::now_utc(),
    )?;
    save(&app, &cases)?;
    Ok(saved)
}

#[tauri::command]
pub fn delete_test_case(app: AppHandle, workspace_id: String, id: String) -> Result<(), String> {
    let mut cases = load(&app)?;
    soft_delete(&mut cases, &workspace_id, &id, OffsetDateTime::now_utc())?;
    save(&app, &cases)
}

#[cfg(test)]
mod tests {
    use super::*;
    use time::format_description::well_known::Rfc3339;

    fn at(rfc3339: &str) -> OffsetDateTime {
        OffsetDateTime::parse(rfc3339, &Rfc3339).expect("test timestamp must be RFC 3339")
    }

    fn input(title: &str) -> TestCaseInput {
        TestCaseInput {
            id: None,
            title: title.into(),
            description: String::new(),
            platform: Platform::Both,
            server: "staging".into(),
            lifecycle: Lifecycle::Active,
            tags: vec!["Auth".into()],
        }
    }

    fn seed(title: &str) -> (Vec<TestCase>, TestCase) {
        let mut cases = Vec::new();
        let created = upsert(
            &mut cases,
            "ws-1",
            input(title),
            "Kevin",
            at("2026-08-04T10:00:00Z"),
        )
        .expect("a titled case saves");
        (cases, created)
    }

    // FR-003 / FR-003c / FR-005
    #[test]
    fn create_stamps_audit_metadata_and_stores_no_run_status() {
        let (cases, created) = seed("User login with valid credentials");

        assert_eq!(cases.len(), 1);
        assert_eq!(created.created_by, "Kevin");
        assert_eq!(created.updated_by, "Kevin");
        assert_eq!(created.created_at, at("2026-08-04T10:00:00Z"));
        assert_eq!(created.lifecycle, Lifecycle::Active);
        assert_eq!(created.deleted_at, None);
        // The serialized shape is the contract with the webview: no status field, ever.
        let json = serde_json::to_string(&created).expect("a case serializes");
        assert!(!json.contains("status"), "{json}");
        assert!(json.contains(r#""platform":"Both""#), "{json}");
    }

    // FR-003c — the enum is the enforcement.
    #[test]
    fn a_platform_outside_ios_android_both_is_rejected() {
        for platform in [r#""iOS""#, r#""Android""#, r#""Both""#] {
            let raw = format!(r#"{{"title":"t","platform":{platform}}}"#);
            serde_json::from_str::<TestCaseInput>(&raw).expect("a spec platform parses");
        }
        let raw = r#"{"title":"t","platform":"Windows"}"#;
        assert!(serde_json::from_str::<TestCaseInput>(raw).is_err());
    }

    // FR-005 — an edit moves `updated_*` and preserves `created_*`.
    #[test]
    fn edit_updates_in_place_and_keeps_the_creation_record() {
        let (mut cases, created) = seed("Typo in titel");

        let edited = upsert(
            &mut cases,
            "ws-1",
            TestCaseInput {
                id: Some(created.id.clone()),
                title: "Typo in title".into(),
                ..input("ignored")
            },
            "Aisha",
            at("2026-08-05T09:00:00Z"),
        )
        .expect("an existing case edits");

        assert_eq!(cases.len(), 1, "an edit must not create a second row");
        assert_eq!(edited.id, created.id);
        assert_eq!(edited.title, "Typo in title");
        assert_eq!(edited.created_by, "Kevin");
        assert_eq!(edited.created_at, created.created_at);
        assert_eq!(edited.updated_by, "Aisha");
        assert_eq!(edited.updated_at, at("2026-08-05T09:00:00Z"));
    }

    // FR-003b — archiving is a lifecycle change and nothing else.
    #[test]
    fn archiving_keeps_the_case_listed_and_touches_no_other_field() {
        let (mut cases, created) = seed("Password reset via email link");

        upsert(
            &mut cases,
            "ws-1",
            TestCaseInput {
                id: Some(created.id.clone()),
                lifecycle: Lifecycle::Archived,
                ..input("Password reset via email link")
            },
            "Kevin",
            at("2026-08-05T09:00:00Z"),
        )
        .expect("archiving is an edit");

        let listed = visible(&cases, "ws-1");
        assert_eq!(listed.len(), 1, "archived is not deleted");
        assert_eq!(listed[0].lifecycle, Lifecycle::Archived);
        assert_eq!(listed[0].deleted_at, None);
    }

    // FR-006 — soft delete hides the row but keeps it resolvable.
    #[test]
    fn delete_is_soft_so_historical_references_still_resolve() {
        let (mut cases, created) = seed("Apply coupon code at checkout");

        soft_delete(&mut cases, "ws-1", &created.id, at("2026-08-06T09:00:00Z"))
            .expect("an existing case deletes");

        assert!(visible(&cases, "ws-1").is_empty());
        assert_eq!(cases.len(), 1, "the row itself is kept");
        assert_eq!(cases[0].deleted_at, Some(at("2026-08-06T09:00:00Z")));

        // A second delete must not rewrite the original deletion time.
        soft_delete(&mut cases, "ws-1", &created.id, at("2026-08-07T09:00:00Z")).unwrap();
        assert_eq!(cases[0].deleted_at, Some(at("2026-08-06T09:00:00Z")));
    }

    // FR-001 / FR-056c — reads and writes never cross a workspace boundary.
    #[test]
    fn a_case_is_invisible_and_unwritable_from_another_workspace() {
        let (mut cases, created) = seed("Checkout with saved payment method");

        assert_eq!(visible(&cases, "ws-1").len(), 1);
        assert!(visible(&cases, "ws-2").is_empty());
        assert!(soft_delete(&mut cases, "ws-2", &created.id, at("2026-08-06T09:00:00Z")).is_err());
        assert!(upsert(
            &mut cases,
            "ws-2",
            TestCaseInput {
                id: Some(created.id.clone()),
                ..input("stolen")
            },
            "Mallory",
            at("2026-08-06T09:00:00Z"),
        )
        .is_err());
        assert_eq!(cases[0].title, "Checkout with saved payment method");
    }

    // FR-008 — duplicate titles are allowed; a blank one is not a case.
    #[test]
    fn duplicate_titles_are_allowed_and_a_blank_title_is_refused() {
        let (mut cases, _) = seed("Login");
        upsert(
            &mut cases,
            "ws-1",
            input("Login"),
            "Kevin",
            at("2026-08-04T10:00:01Z"),
        )
        .expect("duplicate titles are allowed (FR-008)");
        assert_eq!(visible(&cases, "ws-1").len(), 2);

        assert!(upsert(
            &mut cases,
            "ws-1",
            input("   "),
            "Kevin",
            at("2026-08-04T10:00:02Z")
        )
        .is_err());
    }
}
