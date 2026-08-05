//! Device registry — FR-015, FR-017, FR-018, FR-019, FR-022.
//!
//! Three rules shape this module:
//!
//! - **The registry filters, it never authenticates** (FR-020). `ws::pairing::authorize()` is the
//!   trust gate and stays that way; everything here runs *after* it. `admits()` decides whether a
//!   device that already proved itself may go on to send records — a policy question, not a trust
//!   one.
//! - **Disable is not delete** (FR-018). `enabled = false` keeps the row, its name and its
//!   credential; removing the row is the thing that forces a re-pair.
//! - **The reconnect credential is stored hashed** (FR-020, data-model `Device`). The desktop only
//!   ever needs to *recognise* a returning device, never to replay its secret, so the plaintext
//!   credential leaves in the pairing response and is never written down.
//!
//! ponytail: one JSON file under the app data dir, rewritten whole on every write — the same store
//! shape as `test_case.rs`, with the same ceiling (O(n) per save, not concurrent-safe across
//! processes) and the same upgrade path (feat-023's rusqlite tables read this file once).

use std::fs;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::AppHandle;
use time::OffsetDateTime;

const STORE_FILE: &str = "devices.json";

/// FR-017. `Allowlist` is the default: an unregistered device is refused until somebody registers
/// it, which is the safe way round — the other order admits data before anyone decided to.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
pub enum AccessPolicy {
    Open,
    #[default]
    Allowlist,
}

/// FR-022. `None` until the device reports it — "once available" is the requirement, so an unknown
/// platform is a state to render, not a value to guess.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ObservedPlatform {
    #[serde(rename = "iOS")]
    IOs,
    Android,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Device {
    pub id: String,
    pub workspace_id: String,
    /// SDK-reported and stable (FR-015). Never a credential (FR-020).
    pub device_id: String,
    pub display_name: String,
    #[serde(default)]
    pub observed_platform: Option<ObservedPlatform>,
    /// FR-018: disabling rejects future records without losing the registration.
    pub enabled: bool,
    /// SHA-256 of the credential `ws::pairing::authorize()` minted. Never the credential itself.
    #[serde(default)]
    pub reconnect_credential_hash: Option<String>,
    #[serde(default)]
    pub sdk_contract_version: String,
    #[serde(default)]
    pub sdk_capabilities: Vec<String>,
    #[serde(default)]
    pub os_version: String,
    #[serde(with = "time::serde::rfc3339")]
    pub registered_at: OffsetDateTime,
}

/// What a handshake tells us about the device. `platform` / `os_version` are optional because the
/// contract's `hello` does not carry them — they arrive with the first records (FR-022).
#[derive(Debug, Clone, Default, Deserialize)]
pub struct Observation {
    pub device_id: String,
    #[serde(default)]
    pub contract_version: String,
    #[serde(default)]
    pub capabilities: Vec<String>,
    #[serde(default)]
    pub platform: Option<ObservedPlatform>,
    #[serde(default)]
    pub os_version: Option<String>,
}

/// ponytail: the policy is app-wide, not per-workspace. FR-017 asks for "a configurable device
/// access policy" and one desktop is one physical bench; make it a per-workspace column when a
/// workspace needs a different answer than the machine it runs on.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Registry {
    #[serde(default)]
    pub policy: AccessPolicy,
    #[serde(default)]
    pub devices: Vec<Device>,
}

fn hash(credential: &str) -> String {
    format!("{:x}", Sha256::digest(credential.as_bytes()))
}

fn position(registry: &Registry, workspace_id: &str, device_id: &str) -> Option<usize> {
    registry
        .devices
        .iter()
        .position(|d| d.workspace_id == workspace_id && d.device_id == device_id)
}

/// FR-001: registrations are scoped to the active workspace.
pub fn visible(registry: &Registry, workspace_id: &str) -> Vec<Device> {
    registry
        .devices
        .iter()
        .filter(|d| d.workspace_id == workspace_id)
        .cloned()
        .collect()
}

/// Called after `ws::pairing::authorize()` succeeds. Creates the registration on a first pairing
/// and refreshes the observed facts on a later one — the display name, the enabled flag and
/// `registered_at` are the operator's, so a re-pair never overwrites them (FR-018).
pub fn register(
    registry: &mut Registry,
    workspace_id: &str,
    observed: &Observation,
    reconnect_credential: &str,
    now: OffsetDateTime,
) -> Device {
    let existing = position(registry, workspace_id, &observed.device_id);
    let device = Device {
        id: existing
            .map(|i| registry.devices[i].id.clone())
            .unwrap_or_else(|| format!("dev-{}", now.unix_timestamp_nanos())),
        workspace_id: workspace_id.to_string(),
        device_id: observed.device_id.clone(),
        display_name: existing
            .map(|i| registry.devices[i].display_name.clone())
            .unwrap_or_else(|| observed.device_id.clone()),
        // FR-022: a later handshake that no longer reports the platform must not erase what we saw.
        observed_platform: observed
            .platform
            .or_else(|| existing.and_then(|i| registry.devices[i].observed_platform)),
        enabled: existing.map(|i| registry.devices[i].enabled).unwrap_or(true),
        reconnect_credential_hash: Some(hash(reconnect_credential)),
        sdk_contract_version: observed.contract_version.clone(),
        sdk_capabilities: observed.capabilities.clone(),
        os_version: observed
            .os_version
            .clone()
            .or_else(|| existing.map(|i| registry.devices[i].os_version.clone()))
            .unwrap_or_default(),
        registered_at: existing.map(|i| registry.devices[i].registered_at).unwrap_or(now),
    };

    match existing {
        Some(i) => registry.devices[i] = device.clone(),
        None => registry.devices.push(device.clone()),
    }
    device
}

/// FR-017 / FR-018 — the filter feat-015 applies at the WS gate, once the pairing token or the
/// reconnect credential has already established trust. `Ok` means records may flow.
pub fn admits(registry: &Registry, workspace_id: &str, device_id: &str) -> Result<(), String> {
    match position(registry, workspace_id, device_id) {
        // FR-018: disabled rejects future records in either policy — that is what disabling is for.
        Some(i) if !registry.devices[i].enabled => Err(format!(
            "{} is disabled for this workspace. Enable it to accept records again.",
            registry.devices[i].display_name
        )),
        Some(_) => Ok(()),
        None if registry.policy == AccessPolicy::Open => Ok(()),
        None => Err(
            "This device is not registered and the access policy is allowlist. Pair it to register it."
                .into(),
        ),
    }
}

/// FR-018/019: a returning device presents the credential it was given, so it does not need a new
/// QR. Recognition only — the credential is compared by hash and never replayed.
pub fn reconnects(
    registry: &Registry,
    workspace_id: &str,
    device_id: &str,
    credential: &str,
) -> bool {
    position(registry, workspace_id, device_id)
        .and_then(|i| registry.devices[i].reconnect_credential_hash.as_deref())
        .is_some_and(|stored| stored == hash(credential))
        && admits(registry, workspace_id, device_id).is_ok()
}

fn device_mut<'a>(
    registry: &'a mut Registry,
    workspace_id: &str,
    id: &str,
) -> Result<&'a mut Device, String> {
    registry
        .devices
        .iter_mut()
        .find(|d| d.id == id && d.workspace_id == workspace_id)
        .ok_or_else(|| "That device is no longer registered.".into())
}

/// FR-015: the display name is the user's, so it is the one thing they can always change.
pub fn rename(registry: &mut Registry, workspace_id: &str, id: &str, name: &str) -> Result<(), String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("A device needs a display name.".into());
    }
    device_mut(registry, workspace_id, id)?.display_name = name.to_string();
    Ok(())
}

/// FR-018: enable/disable without deleting the registration.
pub fn set_enabled(
    registry: &mut Registry,
    workspace_id: &str,
    id: &str,
    enabled: bool,
) -> Result<(), String> {
    device_mut(registry, workspace_id, id)?.enabled = enabled;
    Ok(())
}

/// FR-018: removal is the destructive one — the credential goes with the row, so the device has to
/// pair again from a QR.
pub fn remove(registry: &mut Registry, workspace_id: &str, id: &str) -> Result<(), String> {
    let before = registry.devices.len();
    registry
        .devices
        .retain(|d| !(d.id == id && d.workspace_id == workspace_id));
    if registry.devices.len() == before {
        return Err("That device is no longer registered.".into());
    }
    Ok(())
}

/// FR-019: registrations and their enabled state survive a restart because they live in a file, not
/// in the process.
pub(crate) fn load(app: &AppHandle) -> Result<Registry, String> {
    let path = crate::store_path(app, STORE_FILE)?;
    match fs::read_to_string(&path) {
        Ok(raw) => {
            serde_json::from_str(&raw).map_err(|e| format!("{} is not readable: {e}", path.display()))
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Registry::default()),
        Err(e) => Err(format!("Could not read {}: {e}", path.display())),
    }
}

fn save(app: &AppHandle, registry: &Registry) -> Result<(), String> {
    let path = crate::store_path(app, STORE_FILE)?;
    let raw = serde_json::to_string_pretty(registry).map_err(|e| e.to_string())?;
    fs::write(&path, raw).map_err(|e| format!("Could not write {}: {e}", path.display()))
}

fn edit(
    app: &AppHandle,
    change: impl FnOnce(&mut Registry) -> Result<(), String>,
) -> Result<Registry, String> {
    let mut registry = load(app)?;
    change(&mut registry)?;
    save(app, &registry)?;
    Ok(registry)
}

#[tauri::command]
pub fn list_devices(app: AppHandle, workspace_id: String) -> Result<Registry, String> {
    let registry = load(&app)?;
    Ok(Registry {
        policy: registry.policy,
        devices: visible(&registry, &workspace_id),
    })
}

#[tauri::command]
pub fn rename_device(
    app: AppHandle,
    workspace_id: String,
    id: String,
    display_name: String,
) -> Result<(), String> {
    edit(&app, |r| rename(r, &workspace_id, &id, &display_name)).map(|_| ())
}

#[tauri::command]
pub fn set_device_enabled(
    app: AppHandle,
    workspace_id: String,
    id: String,
    enabled: bool,
) -> Result<(), String> {
    edit(&app, |r| set_enabled(r, &workspace_id, &id, enabled)).map(|_| ())
}

#[tauri::command]
pub fn remove_device(app: AppHandle, workspace_id: String, id: String) -> Result<(), String> {
    edit(&app, |r| remove(r, &workspace_id, &id)).map(|_| ())
}

#[tauri::command]
pub fn set_device_policy(app: AppHandle, policy: AccessPolicy) -> Result<(), String> {
    edit(&app, |r| {
        r.policy = policy;
        Ok(())
    })
    .map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;
    use time::format_description::well_known::Rfc3339;

    fn at(value: &str) -> OffsetDateTime {
        OffsetDateTime::parse(value, &Rfc3339).unwrap()
    }

    fn seen(device_id: &str) -> Observation {
        Observation {
            device_id: device_id.into(),
            contract_version: "1.0.0".into(),
            capabilities: vec!["logs".into()],
            platform: None,
            os_version: None,
        }
    }

    fn registry_with(device_id: &str) -> (Registry, Device) {
        let mut registry = Registry::default();
        let device = register(
            &mut registry,
            "ws-1",
            &seen(device_id),
            "cred-1",
            at("2026-08-06T10:00:00Z"),
        );
        (registry, device)
    }

    // FR-015
    #[test]
    fn a_paired_device_is_registered_under_its_stable_id_with_a_renameable_name() {
        let (mut registry, device) = registry_with("sdk-abc");
        assert_eq!(device.device_id, "sdk-abc");
        assert_eq!(device.display_name, "sdk-abc", "the id stands in until named");
        assert!(device.enabled, "a freshly paired device is usable");

        rename(&mut registry, "ws-1", &device.id, "  Pixel 8  ").unwrap();
        assert_eq!(visible(&registry, "ws-1")[0].display_name, "Pixel 8");
        assert!(rename(&mut registry, "ws-1", &device.id, "  ").is_err());
    }

    // FR-018 — disabling rejects future records, and keeps everything else.
    #[test]
    fn disabling_rejects_records_without_losing_the_registration() {
        let (mut registry, device) = registry_with("sdk-abc");
        rename(&mut registry, "ws-1", &device.id, "Pixel 8").unwrap();
        set_enabled(&mut registry, "ws-1", &device.id, false).unwrap();

        let refused = admits(&registry, "ws-1", "sdk-abc").unwrap_err();
        assert!(refused.contains("Pixel 8"), "{refused}");
        assert_eq!(visible(&registry, "ws-1").len(), 1, "the row survives");

        // Even with the policy wide open: disabled means disabled.
        registry.policy = AccessPolicy::Open;
        assert!(admits(&registry, "ws-1", "sdk-abc").is_err());

        set_enabled(&mut registry, "ws-1", &device.id, true).unwrap();
        assert!(admits(&registry, "ws-1", "sdk-abc").is_ok());
    }

    // FR-017 — allowlist is the default, and `open` is the only thing that admits a stranger.
    #[test]
    fn the_default_policy_is_allowlist() {
        let mut registry = Registry::default();
        assert_eq!(registry.policy, AccessPolicy::Allowlist);
        assert!(admits(&registry, "ws-1", "never-seen").is_err());

        registry.policy = AccessPolicy::Open;
        assert!(admits(&registry, "ws-1", "never-seen").is_ok());
    }

    // FR-018 — removal is what forces a re-pair; the credential goes with the row.
    #[test]
    fn removing_a_registration_forces_re_pairing() {
        let (mut registry, device) = registry_with("sdk-abc");
        assert!(reconnects(&registry, "ws-1", "sdk-abc", "cred-1"));

        remove(&mut registry, "ws-1", &device.id).unwrap();
        assert!(visible(&registry, "ws-1").is_empty());
        assert!(!reconnects(&registry, "ws-1", "sdk-abc", "cred-1"));
        assert!(admits(&registry, "ws-1", "sdk-abc").is_err());
        assert!(remove(&mut registry, "ws-1", &device.id).is_err());
    }

    // FR-020 — the credential is recognised, never stored in the clear, and never crosses workspaces.
    #[test]
    fn the_reconnect_credential_is_stored_hashed_and_checked_against_the_registry() {
        let (registry, _) = registry_with("sdk-abc");
        let stored = registry.devices[0].reconnect_credential_hash.as_deref().unwrap();
        assert_ne!(stored, "cred-1");
        assert_eq!(stored.len(), 64);

        assert!(reconnects(&registry, "ws-1", "sdk-abc", "cred-1"));
        assert!(!reconnects(&registry, "ws-1", "sdk-abc", "cred-2"));
        assert!(!reconnects(&registry, "ws-2", "sdk-abc", "cred-1"));
        assert!(!reconnects(&registry, "ws-1", "other-device", "cred-1"));
    }

    // FR-018 / FR-022 — a re-pair refreshes what the SDK reports and leaves what the operator set.
    #[test]
    fn re_pairing_keeps_the_operator_s_edits_and_refreshes_the_observed_facts() {
        let (mut registry, device) = registry_with("sdk-abc");
        rename(&mut registry, "ws-1", &device.id, "Bench iPhone").unwrap();
        set_enabled(&mut registry, "ws-1", &device.id, false).unwrap();

        let observed = Observation {
            platform: Some(ObservedPlatform::IOs),
            os_version: Some("17.4".into()),
            capabilities: vec!["logs".into(), "screenshots".into()],
            ..seen("sdk-abc")
        };
        let again = register(&mut registry, "ws-1", &observed, "cred-2", at("2026-08-06T11:00:00Z"));

        assert_eq!(registry.devices.len(), 1, "a re-pair is not a second row");
        assert_eq!(again.display_name, "Bench iPhone");
        assert!(!again.enabled, "a re-pair must not silently re-enable a disabled device");
        assert_eq!(again.registered_at, at("2026-08-06T10:00:00Z"));
        assert_eq!(again.observed_platform, Some(ObservedPlatform::IOs));
        assert_eq!(again.os_version, "17.4");
        assert_eq!(again.sdk_capabilities.len(), 2);
        // The new credential is stored, but a disabled device still does not get back in (FR-018).
        assert!(!reconnects(&registry, "ws-1", "sdk-abc", "cred-2"));
        set_enabled(&mut registry, "ws-1", &device.id, true).unwrap();
        assert!(reconnects(&registry, "ws-1", "sdk-abc", "cred-2"));
        assert!(!reconnects(&registry, "ws-1", "sdk-abc", "cred-1"), "the old one is replaced");

        // FR-022: a later hello without the platform must not erase what was observed.
        let quiet = register(&mut registry, "ws-1", &seen("sdk-abc"), "cred-3", at("2026-08-06T12:00:00Z"));
        assert_eq!(quiet.observed_platform, Some(ObservedPlatform::IOs));
        assert_eq!(quiet.os_version, "17.4");
    }

    // FR-019 — what a restart reads back is what was written.
    #[test]
    fn the_registry_round_trips_through_its_stored_form() {
        let (mut registry, device) = registry_with("sdk-abc");
        rename(&mut registry, "ws-1", &device.id, "Pixel 8").unwrap();
        set_enabled(&mut registry, "ws-1", &device.id, false).unwrap();
        registry.policy = AccessPolicy::Open;

        let raw = serde_json::to_string(&registry).unwrap();
        let reloaded: Registry = serde_json::from_str(&raw).unwrap();
        assert_eq!(reloaded.policy, AccessPolicy::Open);
        assert_eq!(reloaded.devices, registry.devices);
        assert!(!reloaded.devices[0].enabled);

        // An empty store is an empty allowlist, not an error.
        let fresh: Registry = serde_json::from_str("{}").unwrap();
        assert_eq!(fresh.policy, AccessPolicy::Allowlist);
        assert!(fresh.devices.is_empty());
    }
}
