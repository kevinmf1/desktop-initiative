//! The `sync-api` client — FR-035 and FR-035b.
//!
//! The rule the whole module exists to keep: **nothing here is ever on a capture path.** A session
//! streams, a bug is marked, a marker is triaged — all of that is written to the local stores and
//! is finished. This module runs *afterwards*, on a timer and on demand, and pushes whatever is
//! still marked `synced_at: null`. A backend that is down, unreachable or not configured produces a
//! report saying so and leaves the outbox exactly as it was (SC-005: "a 503 is a non-event").
//!
//! The outbox is therefore not a queue: it is a **derived view** of the stores — every record whose
//! `synced_at` is null. That is what makes it survive a restart with no extra file, and what makes a
//! crash mid-push cost nothing: the record is simply still unsynced next time.
//!
//! ponytail: one `POST /v1/sync/batch` for everything, no per-entity endpoints, no exponential
//! backoff — a fixed retry tick is enough for a desktop that is either on the LAN or not. The
//! upgrade path, if a workspace ever gets large, is the contract's `since` cursor for pull.

use std::collections::HashSet;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager, State};
use time::OffsetDateTime;

use crate::{bug::Bug, test_session::TestSession, ws::server::WsServer};

/// The contract version this client speaks (`sync-api` 1.0.0).
pub const CONTRACT_VERSION: &str = "1.0.0";

/// How often the outbox drains by itself. Long enough to be invisible, short enough that "the
/// backend came back" does not need anyone to click anything.
const RETRY_SECONDS: u64 = 60;

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
pub struct SyncReport {
    /// Records still waiting after this attempt — the number the UI shows as "not yet synced".
    pub queued: usize,
    pub applied: usize,
    pub duplicate: usize,
    pub rejected: Vec<String>,
    /// True when the backend could not be reached at all. Not an error: the records stay queued.
    pub offline: bool,
    pub detail: String,
}

#[derive(Debug, Deserialize)]
struct RecordResult {
    id: String,
    status: String,
    #[serde(default)]
    reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct BatchResponse {
    #[serde(default)]
    results: Vec<RecordResult>,
}

fn record(entity: &str, id: &str, updated_at: OffsetDateTime, payload: Value) -> Value {
    json!({
        "entity": entity,
        "op": "upsert",
        "id": id,
        "payload": payload,
        "client_updated_at": updated_at
            .format(&time::format_description::well_known::Rfc3339)
            .unwrap_or_default(),
    })
}

/// The outbox: every record in this workspace the backend has not confirmed. A Bug's own
/// `marked_at` and a session's stop (or start) time are the `client_updated_at` the contract's
/// last-writer-wins rule is resolved by — the desktop never invents a clock for them.
pub fn pending(bugs: &[Bug], sessions: &[TestSession], workspace_id: &str) -> Vec<Value> {
    let queued_sessions = sessions
        .iter()
        .filter(|s| s.workspace_id == workspace_id && s.synced_at.is_none())
        .map(|s| {
            record(
                "session",
                &s.id,
                s.stopped_at.unwrap_or(s.started_at),
                serde_json::to_value(s).unwrap_or(Value::Null),
            )
        });
    // Sessions first: a Bug names its session, so pushing them in this order means a backend that
    // applies a batch in sequence never sees the reference before the row.
    queued_sessions
        .chain(
            bugs.iter()
                .filter(|b| b.workspace_id == workspace_id && b.synced_at.is_none())
                .map(|b| {
                    record("bug", &b.id, b.marked_at, serde_json::to_value(b).unwrap_or(Value::Null))
                }),
        )
        .collect()
}

pub fn batch_body(workspace_id: &str, records: &[Value]) -> Value {
    json!({ "workspace_id": workspace_id, "records": records })
}

/// Stable across replays of the same batch, which is the point: the contract answers a replay with
/// `status:"duplicate"` and no second row, and that only works if the key does not change.
pub fn idempotency_key(body: &Value) -> String {
    let digest = Sha256::digest(body.to_string().as_bytes());
    digest[..16].iter().map(|byte| format!("{byte:02x}")).collect()
}

/// `applied` and `duplicate` both mean "the backend holds this record" — a duplicate is the correct
/// outcome of a replay, never an error (contract, *Error handling*).
fn confirmed(results: &[RecordResult]) -> HashSet<String> {
    results
        .iter()
        .filter(|r| r.status == "applied" || r.status == "duplicate")
        .map(|r| r.id.clone())
        .collect()
}

fn rejections(results: &[RecordResult]) -> Vec<String> {
    results
        .iter()
        .filter(|r| r.status != "applied" && r.status != "duplicate")
        .map(|r| {
            format!(
                "{}: {}",
                r.id,
                r.reason.clone().unwrap_or_else(|| r.status.clone())
            )
        })
        .collect()
}

/// Marks what the backend confirmed. A record it rejected keeps `synced_at: null` and is offered
/// again next tick — with its reason surfaced, so a revoked membership reads as a reason rather
/// than as a sync that silently never finishes (research R20).
fn mark_confirmed(
    bugs: &mut [Bug],
    sessions: &mut [TestSession],
    ids: &HashSet<String>,
    now: OffsetDateTime,
) {
    for bug in bugs.iter_mut().filter(|b| ids.contains(&b.id)) {
        bug.synced_at = Some(now);
    }
    for session in sessions.iter_mut().filter(|s| ids.contains(&s.id)) {
        session.synced_at = Some(now);
    }
}

/// Unreachable, unconfigured, signed out, or refused: one shape, and it always says how many
/// records stayed put. Never an `Err` — the local record is already safe (SC-005).
fn offline_report(body: &Value, detail: String) -> SyncReport {
    SyncReport {
        queued: body["records"].as_array().map_or(0, Vec::len),
        offline: true,
        detail,
        ..SyncReport::default()
    }
}

async fn post_batch(body: &Value, workspace_id: &str) -> Result<BatchResponse, SyncReport> {
    let queued = body["records"].as_array().map_or(0, Vec::len);
    let offline = |detail: String| offline_report(body, detail);

    let base_url = crate::auth_session::api_base_url()
        .map_err(|_| offline("No backend is configured — records stay queued locally.".into()))?;
    let credential = crate::auth_session::credential().ok_or_else(|| {
        offline("Not signed in to the backend — records stay queued locally.".into())
    })?;
    let client = reqwest::Client::new();

    let response = client
        .post(format!("{base_url}/v1/sync/batch"))
        .bearer_auth(credential)
        .header("X-Contract-Version", CONTRACT_VERSION)
        .header("Idempotency-Key", idempotency_key(body))
        .json(body)
        .send()
        .await
        .map_err(|error| offline(format!("The backend is unreachable ({error}).")))?;

    match response.status().as_u16() {
        200..=299 => response
            .json::<BatchResponse>()
            .await
            .map_err(|error| offline(format!("The backend sent a batch reply we could not read ({error})."))),
        // FR-000c: a major mismatch names the out-of-date side rather than half-syncing.
        426 => Err(SyncReport {
            queued,
            detail: format!(
                "The backend speaks a different major version of sync-api than this desktop ({CONTRACT_VERSION}). Update whichever is older."
            ),
            ..SyncReport::default()
        }),
        // Nothing here is a user-facing failure: the outbox is intact and the next tick retries.
        status => Err(offline(format!(
            "The backend refused the batch for {workspace_id} with HTTP {status} — records stay queued."
        ))),
    }
}

/// One drain of the outbox. Returns a report rather than an error for every "could not reach the
/// backend" case — the local record is already safe, which is the whole of FR-035b's promise.
pub async fn drain(app: &AppHandle, workspace_id: &str) -> Result<SyncReport, String> {
    let mut bugs = crate::bug::load(app)?;
    let mut sessions = crate::test_session::load(app)?;
    let records = pending(&bugs, &sessions, workspace_id);
    if records.is_empty() {
        return Ok(SyncReport {
            detail: "Everything in this workspace is synced.".into(),
            ..SyncReport::default()
        });
    }

    let body = batch_body(workspace_id, &records);
    let response = match post_batch(&body, workspace_id).await {
        Ok(response) => response,
        Err(report) => return Ok(report),
    };

    let ids = confirmed(&response.results);
    mark_confirmed(&mut bugs, &mut sessions, &ids, OffsetDateTime::now_utc());
    crate::bug::save(app, &bugs)?;
    crate::test_session::save(app, &sessions)?;

    let rejected = rejections(&response.results);
    Ok(SyncReport {
        queued: pending(&bugs, &sessions, workspace_id).len(),
        applied: response.results.iter().filter(|r| r.status == "applied").count(),
        duplicate: response.results.iter().filter(|r| r.status == "duplicate").count(),
        detail: if rejected.is_empty() {
            format!("Synced {} record(s).", ids.len())
        } else {
            format!("Synced {} record(s); {} still queued.", ids.len(), rejected.len())
        },
        rejected,
        offline: false,
    })
}

#[tauri::command]
pub async fn sync_now(app: AppHandle, workspace_id: String) -> Result<SyncReport, String> {
    drain(&app, &workspace_id).await
}

// ponytail: no `sync_queue` command — a record's own `synced_at` is already on the screen, so the
// queue count is a `.filter()` in the webview rather than a second source of the same truth.

/// The "once a connection is available" half of FR-035b: a fixed tick, started with the app, that
/// drains whatever the active workspace still owes. It never reports to the user — the queue count
/// on the screen is the honest signal, and a retry that failed is just a retry that will happen
/// again.
pub fn start(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(RETRY_SECONDS)).await;
            let workspace_id = {
                let server: State<'_, WsServer> = app.state();
                server.workspace_id.lock().map(|id| id.clone()).unwrap_or_default()
            };
            if workspace_id.is_empty() {
                continue;
            }
            if let Err(error) = drain(&app, &workspace_id).await {
                eprintln!("sync-api: {error}");
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::device::ObservedPlatform;
    use time::format_description::well_known::Rfc3339;

    fn at(value: &str) -> OffsetDateTime {
        OffsetDateTime::parse(value, &Rfc3339).unwrap()
    }

    fn session(id: &str, workspace_id: &str, synced: bool) -> TestSession {
        TestSession {
            id: id.into(),
            workspace_id: workspace_id.into(),
            test_plan_id: None,
            device_id: "dev-a".into(),
            name: "Regression".into(),
            started_by: "Kevin".into(),
            started_at: at("2026-08-10T10:00:00Z"),
            stopped_at: None,
            build_version: "2.4.1".into(),
            platform: ObservedPlatform::Android,
            server: "staging".into(),
            result: None,
            case_ids: vec![],
            synced_at: synced.then(|| at("2026-08-10T10:01:00Z")),
        }
    }

    fn bug(id: &str, workspace_id: &str, synced: bool) -> Bug {
        Bug {
            id: id.into(),
            workspace_id: workspace_id.into(),
            test_session_id: "ts-1".into(),
            device_id: "dev-a".into(),
            title: "Checkout 500s".into(),
            description: String::new(),
            severity: Default::default(),
            status: Default::default(),
            test_case_id: None,
            test_plan_id: None,
            build_version: "2.4.1".into(),
            environment: "staging".into(),
            marked_by: "Kevin".into(),
            marked_at: at("2026-08-10T10:15:00Z"),
            window_seconds: 30,
            window_start: at("2026-08-10T10:14:30Z"),
            window_end: at("2026-08-10T10:15:30Z"),
            synced_at: synced.then(|| at("2026-08-10T10:16:00Z")),
        }
    }

    #[test]
    fn the_outbox_is_the_unsynced_records_of_this_workspace_sessions_first() {
        let bugs = vec![bug("bug-1", "ws-1", false), bug("bug-2", "ws-1", true), bug("bug-3", "ws-2", false)];
        let sessions = vec![session("ts-1", "ws-1", false), session("ts-2", "ws-1", true)];

        let records = pending(&bugs, &sessions, "ws-1");

        let ids: Vec<&str> = records.iter().map(|r| r["id"].as_str().unwrap()).collect();
        assert_eq!(ids, ["ts-1", "bug-1"]);
        assert_eq!(records[0]["entity"], "session");
        assert_eq!(records[1]["entity"], "bug");
        assert_eq!(records[1]["op"], "upsert");
        // The record's own clock, not the moment of the push — last-writer-wins depends on it.
        assert_eq!(records[1]["client_updated_at"], "2026-08-10T10:15:00Z");
        assert_eq!(records[0]["client_updated_at"], "2026-08-10T10:00:00Z");
        // Another workspace's records are never in this batch.
        assert!(!ids.contains(&"bug-3"));
    }

    #[test]
    fn a_replay_of_the_same_batch_carries_the_same_idempotency_key() {
        let bugs = vec![bug("bug-1", "ws-1", false)];
        let first = batch_body("ws-1", &pending(&bugs, &[], "ws-1"));
        let again = batch_body("ws-1", &pending(&bugs, &[], "ws-1"));
        let other = batch_body("ws-1", &pending(&[bug("bug-9", "ws-1", false)], &[], "ws-1"));

        assert_eq!(idempotency_key(&first), idempotency_key(&again));
        assert_ne!(idempotency_key(&first), idempotency_key(&other));
        assert_eq!(first["workspace_id"], "ws-1");
    }

    #[test]
    fn applied_and_duplicate_both_clear_the_outbox_and_a_rejection_keeps_it_queued() {
        let results = vec![
            RecordResult { id: "ts-1".into(), status: "applied".into(), reason: None },
            RecordResult { id: "bug-1".into(), status: "duplicate".into(), reason: None },
            RecordResult {
                id: "bug-2".into(),
                status: "rejected".into(),
                reason: Some("workspace membership revoked".into()),
            },
        ];
        let mut bugs = vec![bug("bug-1", "ws-1", false), bug("bug-2", "ws-1", false)];
        let mut sessions = vec![session("ts-1", "ws-1", false)];

        let ids = confirmed(&results);
        mark_confirmed(&mut bugs, &mut sessions, &ids, at("2026-08-10T11:00:00Z"));

        assert_eq!(sessions[0].synced_at, Some(at("2026-08-10T11:00:00Z")));
        assert_eq!(bugs[0].synced_at, Some(at("2026-08-10T11:00:00Z")));
        // Rejected stays in the outbox, with the backend's own reason attached.
        assert_eq!(bugs[1].synced_at, None);
        assert_eq!(rejections(&results), ["bug-2: workspace membership revoked"]);
        assert_eq!(pending(&bugs, &sessions, "ws-1").len(), 1);
    }

    #[test]
    fn an_unreachable_backend_is_a_report_not_a_failure_and_leaves_the_outbox_intact() {
        let bugs = vec![bug("bug-1", "ws-1", false)];
        let body = batch_body("ws-1", &pending(&bugs, &[], "ws-1"));

        // ponytail: the offline path is asserted on the report it produces, not by standing up an
        // HTTP server. `post_batch` itself is one `send()` away from this — what must never regress
        // is that being offline is a *report*, with the record still queued and nothing marked.
        let report = offline_report(&body, "The backend is unreachable.".into());

        assert!(report.offline);
        assert_eq!(report.queued, 1);
        assert_eq!(report.applied, 0);
        assert!(report.rejected.is_empty());
        assert_eq!(bugs[0].synced_at, None);
    }
}
