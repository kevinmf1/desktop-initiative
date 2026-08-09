//! Test Session lifecycle — FR-012 (start) and FR-014 (stop with a result).
//!
//! A session is the join between everything the other stores already own: a Test Plan *or* an ad
//! hoc set of Test Cases, a registered device, and the build / server / platform the run is
//! against. It owns none of them — it records the ids, so a plan edited afterwards never rewrites
//! what a past run was.
//!
//! `device_id` here is the **SDK-reported stable id**, not the registry row id, because that is
//! what `ws::server::Sessions` keys its records on (FR-021). One lookup joins a session to its
//! captured frames without a translation table.
//!
//! ponytail: same one-JSON-file store as `test_case.rs` / `device.rs`, same ceiling (rewritten
//! whole per save), same upgrade path — feat-023 reads this file once into its tables.

use std::{collections::HashSet, fs};

use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use time::OffsetDateTime;

use crate::device::{self, ObservedPlatform, Registry};
use crate::test_case::TestCase;
use crate::test_plan::TestPlan;

const STORE_FILE: &str = "test-sessions.json";

/// FR-014. Nullable until the session is stopped — an active session has no result, and defaulting
/// it to anything would make an interrupted run look judged.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SessionResult {
    Passed,
    Failed,
    Blocked,
    Incomplete,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TestSession {
    pub id: String,
    pub workspace_id: String,
    /// `None` for an ad hoc run (FR-012 allows either).
    pub test_plan_id: Option<String>,
    pub device_id: String,
    pub name: String,
    pub started_by: String,
    #[serde(with = "time::serde::rfc3339")]
    pub started_at: OffsetDateTime,
    #[serde(default, with = "time::serde::rfc3339::option")]
    pub stopped_at: Option<OffsetDateTime>,
    pub build_version: String,
    pub platform: ObservedPlatform,
    pub server: String,
    #[serde(default)]
    pub result: Option<SessionResult>,
    /// Snapshot of what was in scope when the run started — a later plan edit must not change it.
    #[serde(default)]
    pub case_ids: Vec<String>,
}

impl TestSession {
    pub fn is_running(&self) -> bool {
        self.stopped_at.is_none()
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct StartSessionInput {
    #[serde(default)]
    pub test_plan_id: Option<String>,
    #[serde(default)]
    pub test_case_ids: Vec<String>,
    #[serde(default)]
    pub name: String,
    pub build_version: String,
    pub server: String,
    pub platform: ObservedPlatform,
    pub device_id: String,
}

pub fn visible(sessions: &[TestSession], workspace_id: &str) -> Vec<TestSession> {
    sessions
        .iter()
        .filter(|session| session.workspace_id == workspace_id)
        .cloned()
        .collect()
}

/// FR-012: the scope of a run is a plan **or** ad hoc cases — never neither. A plan contributes its
/// items in order; an ad hoc list is checked against what the workspace actually has, so a stale id
/// from the webview cannot silently produce an empty run.
fn scope(
    plans: &[TestPlan],
    cases: &[TestCase],
    workspace_id: &str,
    input: &StartSessionInput,
) -> Result<Vec<String>, String> {
    if let Some(plan_id) = input.test_plan_id.as_deref() {
        let plan = plans
            .iter()
            .find(|plan| plan.id == plan_id && plan.workspace_id == workspace_id)
            .ok_or("That Test Plan no longer exists.")?;
        if plan.items.is_empty() {
            return Err(format!("{} has no Test Cases to run.", plan.name));
        }
        return Ok(plan.items.iter().map(|i| i.test_case_id.clone()).collect());
    }
    let available: HashSet<&str> = cases
        .iter()
        .filter(|case| case.workspace_id == workspace_id && case.deleted_at.is_none())
        .map(|case| case.id.as_str())
        .collect();
    let mut seen = HashSet::new();
    let case_ids: Vec<String> = input
        .test_case_ids
        .iter()
        .filter(|id| seen.insert(id.as_str()))
        .cloned()
        .collect();
    if let Some(id) = case_ids.iter().find(|id| !available.contains(id.as_str())) {
        return Err(format!("Test Case {id} is unavailable in this workspace."));
    }
    if case_ids.is_empty() {
        return Err("Select a Test Plan or at least one Test Case.".into());
    }
    Ok(case_ids)
}

pub fn start(
    sessions: &mut Vec<TestSession>,
    plans: &[TestPlan],
    cases: &[TestCase],
    registry: &Registry,
    workspace_id: &str,
    input: StartSessionInput,
    started_by: &str,
    now: OffsetDateTime,
) -> Result<TestSession, String> {
    if input.build_version.trim().is_empty() {
        return Err("A session needs a build version.".into());
    }
    if input.server.trim().is_empty() {
        return Err("A session needs a server.".into());
    }
    let device = device::visible(registry, workspace_id)
        .into_iter()
        .find(|d| d.device_id == input.device_id)
        .ok_or("That device is not registered in this workspace.")?;
    if !device.enabled {
        return Err(format!(
            "{} is disabled — enable it before starting a session.",
            device.display_name
        ));
    }
    let case_ids = scope(plans, cases, workspace_id, &input)?;

    // FR-012: the id must be unique. The clock is the source, but two starts inside one nanosecond
    // tick would collide, so the suffix settles it rather than trusting the timer.
    let stem = format!("ts-{}", now.unix_timestamp_nanos());
    let mut id = stem.clone();
    let mut suffix = 1;
    while sessions.iter().any(|session| session.id == id) {
        id = format!("{stem}-{suffix}");
        suffix += 1;
    }

    let session = TestSession {
        id,
        workspace_id: workspace_id.into(),
        test_plan_id: input.test_plan_id.clone(),
        device_id: device.device_id,
        name: match input.name.trim() {
            "" => plans
                .iter()
                .find(|plan| Some(plan.id.as_str()) == input.test_plan_id.as_deref())
                .map(|plan| plan.name.clone())
                .unwrap_or_else(|| "Ad hoc session".into()),
            named => named.into(),
        },
        started_by: started_by.into(),
        started_at: now,
        stopped_at: None,
        build_version: input.build_version.trim().into(),
        platform: input.platform,
        server: input.server.trim().into(),
        result: None,
        case_ids,
    };
    sessions.push(session.clone());
    Ok(session)
}

/// FR-014. Stopping is what records the result, so a session cannot be stopped without one and a
/// stopped session cannot be re-judged.
pub fn stop(
    sessions: &mut [TestSession],
    workspace_id: &str,
    id: &str,
    result: SessionResult,
    now: OffsetDateTime,
) -> Result<TestSession, String> {
    let session = sessions
        .iter_mut()
        .find(|session| session.id == id && session.workspace_id == workspace_id)
        .ok_or("That session no longer exists.")?;
    if !session.is_running() {
        return Err("That session has already been stopped.".into());
    }
    session.stopped_at = Some(now);
    session.result = Some(result);
    Ok(session.clone())
}

pub(crate) fn load(app: &AppHandle) -> Result<Vec<TestSession>, String> {
    let path = crate::store_path(app, STORE_FILE)?;
    match fs::read_to_string(&path) {
        Ok(raw) => serde_json::from_str(&raw)
            .map_err(|e| format!("{} is not readable: {e}", path.display())),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Vec::new()),
        Err(e) => Err(format!("Could not read {}: {e}", path.display())),
    }
}

fn save(app: &AppHandle, sessions: &[TestSession]) -> Result<(), String> {
    let path = crate::store_path(app, STORE_FILE)?;
    let raw = serde_json::to_string_pretty(sessions).map_err(|e| e.to_string())?;
    fs::write(&path, raw).map_err(|e| format!("Could not write {}: {e}", path.display()))
}

#[tauri::command]
pub fn list_test_sessions(app: AppHandle, workspace_id: String) -> Result<Vec<TestSession>, String> {
    Ok(visible(&load(&app)?, &workspace_id))
}

#[tauri::command]
pub fn start_test_session(
    app: AppHandle,
    workspace_id: String,
    input: StartSessionInput,
) -> Result<TestSession, String> {
    let mut sessions = load(&app)?;
    let started = start(
        &mut sessions,
        &crate::test_plan::load(&app)?,
        &crate::test_case::load(&app)?,
        &device::load(&app)?,
        &workspace_id,
        input,
        &crate::test_case::actor(),
        OffsetDateTime::now_utc(),
    )?;
    save(&app, &sessions)?;
    Ok(started)
}

#[tauri::command]
pub fn stop_test_session(
    app: AppHandle,
    workspace_id: String,
    id: String,
    result: SessionResult,
) -> Result<TestSession, String> {
    let mut sessions = load(&app)?;
    let stopped = stop(
        &mut sessions,
        &workspace_id,
        &id,
        result,
        OffsetDateTime::now_utc(),
    )?;
    save(&app, &sessions)?;
    Ok(stopped)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::device::AccessPolicy;
    use crate::test_case::{self, Lifecycle, Platform, TestCaseInput};
    use crate::test_plan::{self, TestPlanInput};
    use time::format_description::well_known::Rfc3339;

    fn at(value: &str) -> OffsetDateTime {
        OffsetDateTime::parse(value, &Rfc3339).unwrap()
    }

    fn cases() -> Vec<TestCase> {
        let mut cases = Vec::new();
        for index in 0..2 {
            test_case::upsert(
                &mut cases,
                "ws-1",
                TestCaseInput {
                    id: None,
                    title: format!("Case {index}"),
                    description: String::new(),
                    platform: Platform::Both,
                    server: String::new(),
                    lifecycle: Lifecycle::Active,
                    tags: vec![],
                },
                "Kevin",
                at(&format!("2026-08-10T09:00:0{index}Z")),
            )
            .unwrap();
        }
        cases
    }

    fn plan(cases: &[TestCase], case_ids: Vec<String>) -> Vec<TestPlan> {
        let mut plans = Vec::new();
        test_plan::upsert(
            &mut plans,
            cases,
            "ws-1",
            TestPlanInput {
                id: None,
                name: "Regression".into(),
                notes: String::new(),
                target_build: "2.4.0".into(),
                environment: "staging".into(),
                lifecycle: Lifecycle::Active,
                test_case_ids: case_ids,
            },
            at("2026-08-10T09:30:00Z"),
        )
        .unwrap();
        plans
    }

    fn registry(enabled: bool) -> Registry {
        let mut registry = Registry {
            policy: AccessPolicy::Allowlist,
            devices: vec![],
        };
        device::register(
            &mut registry,
            "ws-1",
            &device::Observation {
                device_id: "dev-a".into(),
                ..Default::default()
            },
            "credential",
            at("2026-08-10T09:40:00Z"),
        );
        registry.devices[0].display_name = "Pixel 8".into();
        registry.devices[0].enabled = enabled;
        registry
    }

    fn input() -> StartSessionInput {
        StartSessionInput {
            test_plan_id: None,
            test_case_ids: vec![],
            name: String::new(),
            build_version: "2.4.1".into(),
            server: "staging".into(),
            platform: ObservedPlatform::Android,
            device_id: "dev-a".into(),
        }
    }

    fn start_with(
        sessions: &mut Vec<TestSession>,
        plans: &[TestPlan],
        cases: &[TestCase],
        input: StartSessionInput,
        now: &str,
    ) -> Result<TestSession, String> {
        start(
            sessions,
            plans,
            cases,
            &registry(true),
            "ws-1",
            input,
            "Kevin",
            at(now),
        )
    }

    #[test]
    fn starting_from_a_plan_snapshots_its_cases_and_names_the_run() {
        let cases = cases();
        let plans = plan(&cases, vec![cases[0].id.clone(), cases[1].id.clone()]);
        let mut sessions = vec![];

        let session = start_with(
            &mut sessions,
            &plans,
            &cases,
            StartSessionInput {
                test_plan_id: Some(plans[0].id.clone()),
                ..input()
            },
            "2026-08-10T10:00:00Z",
        )
        .unwrap();

        assert_eq!(session.case_ids, vec![cases[0].id.clone(), cases[1].id.clone()]);
        assert_eq!(session.name, "Regression");
        assert_eq!(session.build_version, "2.4.1");
        assert_eq!(session.server, "staging");
        assert_eq!(session.platform, ObservedPlatform::Android);
        assert_eq!(session.device_id, "dev-a");
        assert!(session.is_running());
        assert!(session.result.is_none());
    }

    #[test]
    fn an_ad_hoc_run_needs_at_least_one_available_case() {
        let cases = cases();
        let mut sessions = vec![];

        assert_eq!(
            start_with(&mut sessions, &[], &cases, input(), "2026-08-10T10:00:00Z").unwrap_err(),
            "Select a Test Plan or at least one Test Case."
        );
        assert_eq!(
            start_with(
                &mut sessions,
                &[],
                &cases,
                StartSessionInput {
                    test_case_ids: vec!["tc-missing".into()],
                    ..input()
                },
                "2026-08-10T10:00:00Z",
            )
            .unwrap_err(),
            "Test Case tc-missing is unavailable in this workspace."
        );

        let session = start_with(
            &mut sessions,
            &[],
            &cases,
            StartSessionInput {
                test_case_ids: vec![cases[1].id.clone(), cases[1].id.clone()],
                ..input()
            },
            "2026-08-10T10:00:00Z",
        )
        .unwrap();
        assert_eq!(session.case_ids, vec![cases[1].id.clone()]);
        assert_eq!(session.test_plan_id, None);
        assert_eq!(session.name, "Ad hoc session");
    }

    #[test]
    fn build_server_and_a_usable_device_are_all_required() {
        let cases = cases();
        let ad_hoc = StartSessionInput {
            test_case_ids: vec![cases[0].id.clone()],
            ..input()
        };
        let mut sessions = vec![];

        for (field, bad) in [
            ("A session needs a build version.", StartSessionInput { build_version: "  ".into(), ..ad_hoc.clone() }),
            ("A session needs a server.", StartSessionInput { server: String::new(), ..ad_hoc.clone() }),
            ("That device is not registered in this workspace.", StartSessionInput { device_id: "dev-z".into(), ..ad_hoc.clone() }),
        ] {
            assert_eq!(
                start_with(&mut sessions, &[], &cases, bad, "2026-08-10T10:00:00Z").unwrap_err(),
                field
            );
        }

        let disabled = start(
            &mut sessions,
            &[],
            &cases,
            &registry(false),
            "ws-1",
            ad_hoc,
            "Kevin",
            at("2026-08-10T10:00:00Z"),
        );
        assert_eq!(
            disabled.unwrap_err(),
            "Pixel 8 is disabled — enable it before starting a session."
        );
        assert!(sessions.is_empty());
    }

    #[test]
    fn concurrent_sessions_on_one_clock_tick_still_get_distinct_ids() {
        let cases = cases();
        let ad_hoc = StartSessionInput {
            test_case_ids: vec![cases[0].id.clone()],
            ..input()
        };
        let mut sessions = vec![];

        let first = start_with(&mut sessions, &[], &cases, ad_hoc.clone(), "2026-08-10T10:00:00Z").unwrap();
        let second = start_with(&mut sessions, &[], &cases, ad_hoc, "2026-08-10T10:00:00Z").unwrap();

        assert_ne!(first.id, second.id);
        assert_eq!(visible(&sessions, "ws-1").len(), 2);
        assert!(visible(&sessions, "ws-2").is_empty());
    }

    #[test]
    fn stopping_records_a_result_once_and_only_while_running() {
        let cases = cases();
        let mut sessions = vec![];
        let session = start_with(
            &mut sessions,
            &[],
            &cases,
            StartSessionInput {
                test_case_ids: vec![cases[0].id.clone()],
                ..input()
            },
            "2026-08-10T10:00:00Z",
        )
        .unwrap();

        let stopped = stop(
            &mut sessions,
            "ws-1",
            &session.id,
            SessionResult::Blocked,
            at("2026-08-10T10:30:00Z"),
        )
        .unwrap();

        assert_eq!(stopped.result, Some(SessionResult::Blocked));
        assert_eq!(stopped.stopped_at, Some(at("2026-08-10T10:30:00Z")));
        assert!(!stopped.is_running());
        assert_eq!(
            stop(&mut sessions, "ws-1", &session.id, SessionResult::Passed, at("2026-08-10T11:00:00Z"))
                .unwrap_err(),
            "That session has already been stopped."
        );
        assert_eq!(
            stop(&mut sessions, "ws-2", &session.id, SessionResult::Passed, at("2026-08-10T11:00:00Z"))
                .unwrap_err(),
            "That session no longer exists."
        );
    }
}
