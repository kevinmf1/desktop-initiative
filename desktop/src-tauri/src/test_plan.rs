//! Test Plan store and its links to reusable Test Cases (FR-009…FR-011).

use std::{collections::HashSet, fs};

use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use time::OffsetDateTime;

use crate::test_case::{self, Lifecycle, TestCase};

const STORE_FILE: &str = "test-plans.json";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
pub enum InstanceStatus {
    #[default]
    #[serde(rename = "Not Run")]
    NotRun,
    Passed,
    Failed,
    Blocked,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TestPlanItem {
    pub id: String,
    pub test_case_id: String,
    #[serde(default)]
    pub instance_status: InstanceStatus,
    #[serde(with = "time::serde::rfc3339")]
    pub updated_at: OffsetDateTime,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TestPlan {
    pub id: String,
    pub workspace_id: String,
    pub name: String,
    #[serde(default)]
    pub notes: String,
    #[serde(default)]
    pub target_build: String,
    #[serde(default)]
    pub environment: String,
    #[serde(default)]
    pub lifecycle: Lifecycle,
    #[serde(with = "time::serde::rfc3339")]
    pub created_at: OffsetDateTime,
    #[serde(with = "time::serde::rfc3339")]
    pub updated_at: OffsetDateTime,
    #[serde(default)]
    pub items: Vec<TestPlanItem>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TestPlanInput {
    #[serde(default)]
    pub id: Option<String>,
    pub name: String,
    #[serde(default)]
    pub notes: String,
    #[serde(default)]
    pub target_build: String,
    #[serde(default)]
    pub environment: String,
    #[serde(default)]
    pub lifecycle: Lifecycle,
    #[serde(default)]
    pub test_case_ids: Vec<String>,
}

pub fn visible(plans: &[TestPlan], workspace_id: &str) -> Vec<TestPlan> {
    plans
        .iter()
        .filter(|plan| plan.workspace_id == workspace_id)
        .cloned()
        .collect()
}

fn validate_case_ids(
    cases: &[TestCase],
    workspace_id: &str,
    ids: &[String],
    retained_ids: &HashSet<&str>,
) -> Result<Vec<String>, String> {
    let available: HashSet<&str> = cases
        .iter()
        .filter(|case| case.workspace_id == workspace_id && case.deleted_at.is_none())
        .map(|case| case.id.as_str())
        .collect();
    let mut unique = HashSet::new();
    let ids: Vec<String> = ids
        .iter()
        .filter(|id| unique.insert(id.as_str()))
        .cloned()
        .collect();
    if let Some(id) = ids
        .iter()
        .find(|id| !available.contains(id.as_str()) && !retained_ids.contains(id.as_str()))
    {
        return Err(format!("Test Case {id} is unavailable in this workspace."));
    }
    Ok(ids)
}

pub fn upsert(
    plans: &mut Vec<TestPlan>,
    cases: &[TestCase],
    workspace_id: &str,
    input: TestPlanInput,
    now: OffsetDateTime,
) -> Result<TestPlan, String> {
    if input.name.trim().is_empty() {
        return Err("A Test Plan needs a name.".into());
    }
    let existing = input.id.as_deref().and_then(|id| {
        plans
            .iter()
            .position(|plan| plan.id == id && plan.workspace_id == workspace_id)
    });
    if existing.is_none() && input.id.is_some() {
        return Err("That Test Plan no longer exists.".into());
    }
    // A soft-deleted case may remain linked for historical resolution, but cannot be newly added.
    let retained_ids: HashSet<&str> = existing
        .into_iter()
        .flat_map(|index| {
            plans[index]
                .items
                .iter()
                .map(|item| item.test_case_id.as_str())
        })
        .collect();
    let case_ids = validate_case_ids(cases, workspace_id, &input.test_case_ids, &retained_ids)?;

    let id = input.id.clone().unwrap_or_else(|| new_id("tp", now));
    let previous_items = existing
        .map(|index| plans[index].items.clone())
        .unwrap_or_default();
    let items = case_ids
        .into_iter()
        .enumerate()
        .map(|(index, test_case_id)| {
            previous_items
                .iter()
                .find(|item| item.test_case_id == test_case_id)
                .cloned()
                .unwrap_or_else(|| TestPlanItem {
                    id: format!("tpi-{id}-{index}"),
                    test_case_id,
                    instance_status: InstanceStatus::NotRun,
                    updated_at: now,
                })
        })
        .collect();
    let plan = TestPlan {
        id,
        workspace_id: workspace_id.into(),
        name: input.name.trim().into(),
        notes: input.notes,
        target_build: input.target_build,
        environment: input.environment,
        lifecycle: input.lifecycle,
        created_at: existing.map(|index| plans[index].created_at).unwrap_or(now),
        updated_at: now,
        items,
    };
    match existing {
        Some(index) => plans[index] = plan.clone(),
        None => plans.push(plan.clone()),
    }
    Ok(plan)
}

pub fn archive(
    plans: &mut [TestPlan],
    workspace_id: &str,
    id: &str,
    now: OffsetDateTime,
) -> Result<(), String> {
    let plan = plans
        .iter_mut()
        .find(|plan| plan.id == id && plan.workspace_id == workspace_id)
        .ok_or("That Test Plan no longer exists.")?;
    plan.lifecycle = Lifecycle::Archived;
    plan.updated_at = now;
    Ok(())
}

pub fn duplicate(
    plans: &mut Vec<TestPlan>,
    workspace_id: &str,
    id: &str,
    now: OffsetDateTime,
) -> Result<TestPlan, String> {
    let source = plans
        .iter()
        .find(|plan| plan.id == id && plan.workspace_id == workspace_id)
        .cloned()
        .ok_or("That Test Plan no longer exists.")?;
    let new_id = new_id("tp", now);
    let copy = TestPlan {
        id: new_id.clone(),
        workspace_id: workspace_id.into(),
        name: format!("{} Copy", source.name),
        notes: source.notes,
        target_build: source.target_build,
        environment: source.environment,
        lifecycle: Lifecycle::Active,
        created_at: now,
        updated_at: now,
        items: source
            .items
            .iter()
            .enumerate()
            .map(|(index, item)| TestPlanItem {
                id: format!("tpi-{new_id}-{index}"),
                test_case_id: item.test_case_id.clone(),
                instance_status: InstanceStatus::NotRun,
                updated_at: now,
            })
            .collect(),
    };
    plans.push(copy.clone());
    Ok(copy)
}

fn new_id(prefix: &str, now: OffsetDateTime) -> String {
    format!("{prefix}-{}", now.unix_timestamp_nanos())
}

pub(crate) fn load(app: &AppHandle) -> Result<Vec<TestPlan>, String> {
    let path = crate::store_path(app, STORE_FILE)?;
    match fs::read_to_string(&path) {
        Ok(raw) => serde_json::from_str(&raw)
            .map_err(|e| format!("{} is not readable: {e}", path.display())),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Vec::new()),
        Err(e) => Err(format!("Could not read {}: {e}", path.display())),
    }
}

fn save(app: &AppHandle, plans: &[TestPlan]) -> Result<(), String> {
    let path = crate::store_path(app, STORE_FILE)?;
    let raw = serde_json::to_string_pretty(plans).map_err(|e| e.to_string())?;
    fs::write(&path, raw).map_err(|e| format!("Could not write {}: {e}", path.display()))
}

#[tauri::command]
pub fn list_test_plans(app: AppHandle, workspace_id: String) -> Result<Vec<TestPlan>, String> {
    Ok(visible(&load(&app)?, &workspace_id))
}

#[tauri::command]
pub fn save_test_plan(
    app: AppHandle,
    workspace_id: String,
    input: TestPlanInput,
) -> Result<TestPlan, String> {
    let mut plans = load(&app)?;
    let saved = upsert(
        &mut plans,
        &test_case::load(&app)?,
        &workspace_id,
        input,
        OffsetDateTime::now_utc(),
    )?;
    save(&app, &plans)?;
    Ok(saved)
}

#[tauri::command]
pub fn archive_test_plan(app: AppHandle, workspace_id: String, id: String) -> Result<(), String> {
    let mut plans = load(&app)?;
    archive(&mut plans, &workspace_id, &id, OffsetDateTime::now_utc())?;
    save(&app, &plans)
}

#[tauri::command]
pub fn duplicate_test_plan(
    app: AppHandle,
    workspace_id: String,
    id: String,
) -> Result<TestPlan, String> {
    let mut plans = load(&app)?;
    let copy = duplicate(&mut plans, &workspace_id, &id, OffsetDateTime::now_utc())?;
    save(&app, &plans)?;
    Ok(copy)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_case::{Platform, TestCaseInput};
    use time::format_description::well_known::Rfc3339;

    fn at(value: &str) -> OffsetDateTime {
        OffsetDateTime::parse(value, &Rfc3339).unwrap()
    }

    fn cases() -> Vec<TestCase> {
        let mut cases = Vec::new();
        for (index, workspace) in ["ws-1", "ws-1", "ws-2"].into_iter().enumerate() {
            test_case::upsert(
                &mut cases,
                workspace,
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
                at(&format!("2026-08-06T10:00:0{index}Z")),
            )
            .unwrap();
        }
        cases
    }

    fn input(case_ids: Vec<String>) -> TestPlanInput {
        TestPlanInput {
            id: None,
            name: "Regression".into(),
            notes: "Release checks".into(),
            target_build: "2.4.0".into(),
            environment: "staging".into(),
            lifecycle: Lifecycle::Active,
            test_case_ids: case_ids,
        }
    }

    #[test]
    fn create_links_cases_without_copying_them_and_deduplicates_ids() {
        let cases = cases();
        let mut plans = vec![];
        let id = cases[0].id.clone();
        let plan = upsert(
            &mut plans,
            &cases,
            "ws-1",
            input(vec![id.clone(), id.clone(), cases[1].id.clone()]),
            at("2026-08-06T11:00:00Z"),
        )
        .unwrap();

        assert_eq!(plan.items.len(), 2);
        assert_eq!(plan.items[0].test_case_id, id);
        assert!(plan
            .items
            .iter()
            .all(|item| item.instance_status == InstanceStatus::NotRun));
        assert_eq!(plan.target_build, "2.4.0");
        assert_eq!(plan.environment, "staging");
    }

    #[test]
    fn update_adds_and_removes_links_while_preserving_retained_status() {
        let cases = cases();
        let mut plans = vec![];
        let created = upsert(
            &mut plans,
            &cases,
            "ws-1",
            input(vec![cases[0].id.clone()]),
            at("2026-08-06T11:00:00Z"),
        )
        .unwrap();
        plans[0].items[0].instance_status = InstanceStatus::Passed;

        let edited = upsert(
            &mut plans,
            &cases,
            "ws-1",
            TestPlanInput {
                id: Some(created.id),
                test_case_ids: vec![cases[0].id.clone(), cases[1].id.clone()],
                ..input(vec![])
            },
            at("2026-08-06T12:00:00Z"),
        )
        .unwrap();

        assert_eq!(edited.items[0].instance_status, InstanceStatus::Passed);
        assert_eq!(edited.items[1].instance_status, InstanceStatus::NotRun);
    }

    #[test]
    fn duplicate_reuses_case_references_but_resets_independent_statuses() {
        let cases = cases();
        let mut plans = vec![];
        let created = upsert(
            &mut plans,
            &cases,
            "ws-1",
            input(vec![cases[0].id.clone()]),
            at("2026-08-06T11:00:00Z"),
        )
        .unwrap();
        plans[0].items[0].instance_status = InstanceStatus::Failed;

        let copy = duplicate(&mut plans, "ws-1", &created.id, at("2026-08-06T12:00:00Z")).unwrap();

        assert_eq!(copy.name, "Regression Copy");
        assert_eq!(copy.items[0].test_case_id, cases[0].id);
        assert_eq!(copy.items[0].instance_status, InstanceStatus::NotRun);
        assert_ne!(copy.items[0].id, created.items[0].id);
    }

    #[test]
    fn archive_keeps_the_plan_and_its_items() {
        let cases = cases();
        let mut plans = vec![];
        let created = upsert(
            &mut plans,
            &cases,
            "ws-1",
            input(vec![cases[0].id.clone()]),
            at("2026-08-06T11:00:00Z"),
        )
        .unwrap();

        archive(&mut plans, "ws-1", &created.id, at("2026-08-06T12:00:00Z")).unwrap();

        assert_eq!(visible(&plans, "ws-1").len(), 1);
        assert_eq!(plans[0].lifecycle, Lifecycle::Archived);
        assert_eq!(plans[0].items.len(), 1);
    }

    #[test]
    fn cross_workspace_or_deleted_case_links_are_refused() {
        let mut cases = cases();
        let foreign = cases[2].id.clone();
        let deleted = cases[0].id.clone();
        test_case::soft_delete(&mut cases, "ws-1", &deleted, at("2026-08-06T12:00:00Z")).unwrap();
        let mut plans = vec![];

        assert!(upsert(
            &mut plans,
            &cases,
            "ws-1",
            input(vec![foreign]),
            at("2026-08-06T13:00:00Z")
        )
        .is_err());
        assert!(upsert(
            &mut plans,
            &cases,
            "ws-1",
            input(vec![deleted]),
            at("2026-08-06T13:00:00Z")
        )
        .is_err());
    }

    #[test]
    fn an_existing_soft_deleted_case_link_can_be_retained_but_not_newly_added() {
        let mut cases = cases();
        let deleted = cases[0].id.clone();
        let mut plans = vec![];
        let created = upsert(
            &mut plans,
            &cases,
            "ws-1",
            input(vec![deleted.clone()]),
            at("2026-08-06T11:00:00Z"),
        )
        .unwrap();
        test_case::soft_delete(&mut cases, "ws-1", &deleted, at("2026-08-06T12:00:00Z")).unwrap();

        let edited = upsert(
            &mut plans,
            &cases,
            "ws-1",
            TestPlanInput {
                id: Some(created.id),
                notes: "Updated without dropping history".into(),
                test_case_ids: vec![deleted.clone()],
                ..input(vec![])
            },
            at("2026-08-06T13:00:00Z"),
        )
        .unwrap();

        assert_eq!(edited.items[0].test_case_id, deleted);
        assert_eq!(edited.notes, "Updated without dropping history");
    }
}
