//! Auth Session — the backend-minted session credential, cached in the OS keychain alongside a
//! workspace-membership snapshot (FR-052a, FR-053, FR-053a, FR-054).
//!
//! "Auth Session" (a signed-in user) is unrelated to "Test Session" (a test run) and shares no
//! foreign key with it — see the naming hazard in `specs/frontend/data-model.md`.
//!
//! Two rules shape this module:
//!
//! - **Google tokens are never the session credential and are never forwarded** (FR-052). The
//!   identity proof goes to our backend exactly once, in exchange for an opaque session token;
//!   nothing Google issued is ever cached or sent anywhere else.
//! - **Authentication can never block testing** (FR-053a, Principle III). Within the offline grace
//!   window the desktop makes no auth network calls at all, and the *only* thing grace expiry
//!   changes is [`CachedSession::can_start_new_session`]. It cannot interrupt a running Test
//!   Session and it cannot gate reading local data.

use std::{env, time::Duration};

use keyring::Entry;
use serde::{Deserialize, Serialize};
use time::OffsetDateTime;

use crate::auth::GoogleIdentityProof;

const KEYCHAIN_SERVICE: &str = "com.testlab.desktop";
const KEYCHAIN_ENTRY: &str = "auth-session";
const DEFAULT_OFFLINE_GRACE_DAYS: i64 = 30;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

#[cfg(debug_assertions)]
const DEV_AUTH_ENV: &str = "TESTLAB_DEV_AUTH";

/// What the desktop persists to the OS keychain. Everything needed to run offline, and nothing
/// Google issued.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CachedSession {
    session_token: String,
    refresh_token: Option<String>,
    #[serde(with = "time::serde::rfc3339")]
    issued_at: OffsetDateTime,
    #[serde(with = "time::serde::rfc3339::option")]
    expires_at: Option<OffsetDateTime>,
    #[serde(with = "time::serde::rfc3339")]
    offline_grace_until: OffsetDateTime,
    user: CachedUser,
    memberships: Vec<CachedMembership>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CachedUser {
    pub id: String,
    pub display_name: String,
    pub email: String,
    #[serde(default)]
    pub avatar_url: Option<String>,
}

/// The membership snapshot that lets an offline desktop still scope data to a workspace (R20).
/// The cache is a convenience, never the access decision — the backend re-checks membership on
/// every request (FR-056b).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CachedMembership {
    pub workspace_id: String,
    pub name: String,
    #[serde(default)]
    pub role: Option<String>,
    #[serde(default)]
    pub status: Option<String>,
}

/// `POST /v1/auth/google` response (`specs/frontend/contracts/sync-api.md`). `expires_at` and
/// `offline_grace_until` are optional here so a backend that omits them still yields a usable
/// session with the FR-053 default, and unknown fields are ignored per FR-000d.
#[derive(Debug, Deserialize)]
struct MintedSession {
    session_token: String,
    #[serde(default)]
    refresh_token: Option<String>,
    #[serde(default, with = "time::serde::rfc3339::option")]
    expires_at: Option<OffsetDateTime>,
    #[serde(default, with = "time::serde::rfc3339::option")]
    offline_grace_until: Option<OffsetDateTime>,
    user: CachedUser,
    #[serde(default)]
    memberships: Vec<CachedMembership>,
}

/// The redacted view the webview is allowed to see. Tokens stay in Rust and in the keychain.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Account {
    pub user: CachedUser,
    pub memberships: Vec<CachedMembership>,
    #[serde(with = "time::serde::rfc3339")]
    pub offline_grace_until: OffsetDateTime,
    /// FR-053a — the single thing offline-grace expiry is allowed to gate.
    pub can_start_new_session: bool,
}

impl CachedSession {
    /// FR-053/FR-053a. False only means "re-authenticate before starting a **new** Test Session".
    /// A running session and all locally captured data stay reachable regardless.
    pub fn can_start_new_session(&self, now: OffsetDateTime) -> bool {
        now <= self.offline_grace_until
    }

    fn account(&self, now: OffsetDateTime) -> Account {
        Account {
            user: self.user.clone(),
            memberships: self.memberships.clone(),
            offline_grace_until: self.offline_grace_until,
            can_start_new_session: self.can_start_new_session(now),
        }
    }
}

#[cfg(any(debug_assertions, test))]
fn development_account_for(enabled: bool, now: OffsetDateTime) -> Option<Account> {
    enabled.then(|| Account {
        user: CachedUser {
            id: "local-developer".into(),
            display_name: "Local Developer".into(),
            email: "developer@local.test".into(),
            avatar_url: None,
        },
        memberships: [
            ("local-workspace-1", "Local Workspace Alpha"),
            ("local-workspace-2", "Local Workspace Beta"),
        ]
        .into_iter()
        .map(|(workspace_id, name)| CachedMembership {
            workspace_id: workspace_id.into(),
            name: name.into(),
            role: Some("admin".into()),
            status: Some("active".into()),
        })
        .collect(),
        offline_grace_until: now + time::Duration::days(365),
        can_start_new_session: true,
    })
}

#[cfg(any(debug_assertions, test))]
fn development_auth_enabled(value: Option<&str>) -> bool {
    value.is_some_and(|value| value.trim() == "1")
}

#[cfg(debug_assertions)]
fn development_account(now: OffsetDateTime) -> Option<Account> {
    let configured = env::var(DEV_AUTH_ENV).ok();
    development_account_for(development_auth_enabled(configured.as_deref()), now)
}

#[cfg(not(debug_assertions))]
fn development_account(_now: OffsetDateTime) -> Option<Account> {
    None
}

/// FR-053: the grace window defaults to 30 days and is configurable. The backend's value wins when
/// it sends one; otherwise `issued_at` + the locally configured number of days.
fn grace_deadline(
    issued_at: OffsetDateTime,
    from_backend: Option<OffsetDateTime>,
    grace_days: i64,
) -> OffsetDateTime {
    from_backend.unwrap_or(issued_at + time::Duration::days(grace_days))
}

fn configured_grace_days() -> i64 {
    env::var("TESTLAB_OFFLINE_GRACE_DAYS")
        .ok()
        .and_then(|value| value.trim().parse::<i64>().ok())
        .filter(|days| *days > 0)
        .unwrap_or(DEFAULT_OFFLINE_GRACE_DAYS)
}

/// Builds the keychain record from the backend's response. The session credential is the backend's
/// opaque token — never the Google ID token (FR-052).
fn cache_from(minted: MintedSession, issued_at: OffsetDateTime, grace_days: i64) -> CachedSession {
    CachedSession {
        session_token: minted.session_token,
        refresh_token: minted.refresh_token,
        issued_at,
        expires_at: minted.expires_at,
        offline_grace_until: grace_deadline(issued_at, minted.offline_grace_until, grace_days),
        user: minted.user,
        memberships: minted.memberships,
    }
}

/// The only place a Google-issued token is ever sent, and it goes to our backend only. The backend
/// verifies signature/`iss`/`aud`/`exp`/`nonce` against Google's JWKS before minting (FR-051b).
fn mint_request_body(proof: &GoogleIdentityProof) -> [(&'static str, &str); 2] {
    [("id_token", &proof.id_token), ("nonce", &proof.nonce)]
}

fn api_base_url() -> Result<String, String> {
    env::var("TESTLAB_API_BASE_URL")
        .ok()
        .map(|value| value.trim().trim_end_matches('/').to_owned())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "Sign-in is not configured: TESTLAB_API_BASE_URL is missing".into())
}

fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .build()
        .map_err(|error| format!("Could not prepare the backend request: {error}"))
}

/// Exchanges the Google identity proof for a backend session, caches it, and returns the redacted
/// account. This is the product's single connectivity-dependent moment (FR-053).
pub async fn establish(proof: &GoogleIdentityProof) -> Result<Account, String> {
    let base_url = api_base_url()?;
    let response = http_client()?
        .post(format!("{base_url}/v1/auth/google"))
        .form(&mint_request_body(proof))
        .send()
        .await
        .map_err(|error| format!("Could not reach the TestLab backend to sign in: {error}"))?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!("The TestLab backend rejected the sign-in: {status}"));
    }
    let minted: MintedSession = response
        .json()
        .await
        .map_err(|error| format!("The TestLab backend returned an invalid session: {error}"))?;

    let session = cache_from(minted, OffsetDateTime::now_utc(), configured_grace_days());
    store_cache(&session)?;
    Ok(session.account(OffsetDateTime::now_utc()))
}

/// FR-052a / FR-053 / SC-022: the launch path. Reads the keychain and makes **no** network call, so
/// a fully offline desktop with a cached session starts straight into the workspace.
#[tauri::command]
pub fn cached_account() -> Result<Option<Account>, String> {
    let now = OffsetDateTime::now_utc();
    if let Some(account) = development_account(now) {
        return Ok(Some(account));
    }
    Ok(load_cache()?.map(|session| session.account(now)))
}

/// FR-054: clears the cached credential and the cached workspace snapshot, then revokes
/// server-side on a best-effort basis. Nothing here touches locally captured data or anything
/// already synced to the backend.
#[tauri::command]
pub async fn sign_out() -> Result<(), String> {
    if development_account(OffsetDateTime::now_utc()).is_some() {
        return Err(
            "Local development auth is enabled. Stop the app and unset TESTLAB_DEV_AUTH to sign out."
                .into(),
        );
    }

    // Read first, clear second, revoke last: clearing is unconditional, so an unreachable backend
    // can never leave the desktop signed in.
    let cached = load_cache().ok().flatten();
    clear_cache()?;
    if let Some(session) = cached {
        let _ = revoke(&session.session_token).await;
    }
    Ok(())
}

async fn revoke(session_token: &str) -> Result<(), String> {
    let base_url = api_base_url()?;
    http_client()?
        .post(format!("{base_url}/v1/auth/logout"))
        .bearer_auth(session_token)
        .send()
        .await
        .map_err(|error| format!("Could not revoke the session server-side: {error}"))?;
    Ok(())
}

fn keychain_entry() -> Result<Entry, String> {
    Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_ENTRY)
        .map_err(|error| format!("The OS keychain is unavailable: {error}"))
}

fn store_cache(session: &CachedSession) -> Result<(), String> {
    let json = serde_json::to_string(session)
        .map_err(|error| format!("Could not encode the session for the keychain: {error}"))?;
    keychain_entry()?
        .set_password(&json)
        .map_err(|error| format!("Could not save the session to the OS keychain: {error}"))
}

fn load_cache() -> Result<Option<CachedSession>, String> {
    match keychain_entry()?.get_password() {
        Ok(json) => serde_json::from_str(&json)
            .map(Some)
            // A record we can no longer read is treated as signed-out rather than a hard failure,
            // so a format change can never lock the user out of the app.
            .or(Ok(None)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(format!("Could not read the OS keychain: {error}")),
    }
}

fn clear_cache() -> Result<(), String> {
    match keychain_entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(format!(
            "Could not clear the session from the OS keychain: {error}"
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use time::format_description::well_known::Rfc3339;

    fn at(rfc3339: &str) -> OffsetDateTime {
        OffsetDateTime::parse(rfc3339, &Rfc3339).expect("test timestamp must be RFC 3339")
    }

    fn minted(json: &str) -> MintedSession {
        serde_json::from_str(json).expect("contract response must deserialize")
    }

    const CONTRACT_RESPONSE: &str = r#"{
        "session_token": "opaque-session",
        "refresh_token": "opaque-refresh",
        "expires_at": "2026-09-03T10:00:00Z",
        "offline_grace_until": "2026-10-03T10:00:00Z",
        "user": { "id": "user-1", "display_name": "Kevin", "email": "kevin@example.com" },
        "memberships": [
            { "workspace_id": "ws-1", "name": "Alpha", "role": "admin", "status": "active" },
            { "workspace_id": "ws-2", "name": "Beta", "role": "admin", "status": "invited" }
        ]
    }"#;

    #[test]
    fn contract_response_parses_and_the_backend_grace_window_wins() {
        let issued_at = at("2026-08-04T10:00:00Z");
        let session = cache_from(minted(CONTRACT_RESPONSE), issued_at, 30);

        assert_eq!(session.session_token, "opaque-session");
        assert_eq!(session.refresh_token.as_deref(), Some("opaque-refresh"));
        assert_eq!(session.expires_at, Some(at("2026-09-03T10:00:00Z")));
        assert_eq!(session.offline_grace_until, at("2026-10-03T10:00:00Z"));
        assert_eq!(session.user.email, "kevin@example.com");
        assert_eq!(session.memberships.len(), 2);
        assert_eq!(session.memberships[0].workspace_id, "ws-1");
        assert_eq!(session.memberships[1].status.as_deref(), Some("invited"));
    }

    #[test]
    fn offline_grace_defaults_to_thirty_days_when_the_backend_omits_it() {
        let issued_at = at("2026-08-04T10:00:00Z");
        let response = r#"{
            "session_token": "opaque-session",
            "user": { "id": "user-1", "display_name": "Kevin", "email": "kevin@example.com" },
            "added_by_a_newer_minor": { "ignored": true }
        }"#;
        let session = cache_from(minted(response), issued_at, DEFAULT_OFFLINE_GRACE_DAYS);

        assert_eq!(DEFAULT_OFFLINE_GRACE_DAYS, 30);
        assert_eq!(session.offline_grace_until, at("2026-09-03T10:00:00Z"));
        assert_eq!(session.expires_at, None);
        assert!(session.memberships.is_empty());
    }

    #[test]
    fn the_grace_window_is_configurable() {
        let issued_at = at("2026-08-04T10:00:00Z");
        assert_eq!(
            grace_deadline(issued_at, None, 7),
            at("2026-08-11T10:00:00Z")
        );
        // A configured local default never overrides what the backend actually sent.
        assert_eq!(
            grace_deadline(issued_at, Some(at("2027-01-01T00:00:00Z")), 7),
            at("2027-01-01T00:00:00Z")
        );
    }

    #[test]
    fn grace_expiry_only_gates_starting_a_new_session() {
        let session = cache_from(minted(CONTRACT_RESPONSE), at("2026-08-04T10:00:00Z"), 30);
        let deadline = at("2026-10-03T10:00:00Z");

        assert!(session.can_start_new_session(deadline - time::Duration::seconds(1)));
        assert!(session.can_start_new_session(deadline));

        // Past the deadline the account is still fully readable: the user, the cached memberships
        // that scope local data, and therefore every locally captured record remain reachable.
        // Only the new-session gate flips (FR-053a).
        let expired = session.account(deadline + time::Duration::seconds(1));
        assert!(!expired.can_start_new_session);
        assert_eq!(expired.user.id, "user-1");
        assert_eq!(expired.memberships.len(), 2);
    }

    #[test]
    fn the_cached_credential_is_the_backend_token_and_never_the_google_id_token() {
        let proof = GoogleIdentityProof {
            id_token: "google-id-token".into(),
            nonce: "nonce".into(),
        };
        let session = cache_from(minted(CONTRACT_RESPONSE), at("2026-08-04T10:00:00Z"), 30);
        let stored = serde_json::to_string(&session).unwrap();

        assert_eq!(session.session_token, "opaque-session");
        assert_ne!(session.session_token, proof.id_token);
        assert!(!stored.contains(&proof.id_token));
    }

    #[test]
    fn the_mint_request_forwards_only_the_google_proof() {
        let proof = GoogleIdentityProof {
            id_token: "google-id-token".into(),
            nonce: "nonce-value".into(),
        };
        let body = mint_request_body(&proof);

        assert_eq!(
            body,
            [("id_token", "google-id-token"), ("nonce", "nonce-value")]
        );
    }

    #[test]
    fn the_keychain_record_round_trips() {
        let session = cache_from(minted(CONTRACT_RESPONSE), at("2026-08-04T10:00:00Z"), 30);
        let restored: CachedSession = serde_json::from_str(
            &serde_json::to_string(&session).expect("the keychain blob must encode"),
        )
        .expect("the keychain blob must decode");

        assert_eq!(restored, session);
    }

    #[test]
    fn the_account_view_never_exposes_tokens() {
        let session = cache_from(minted(CONTRACT_RESPONSE), at("2026-08-04T10:00:00Z"), 30);
        let account = serde_json::to_value(session.account(at("2026-08-05T10:00:00Z"))).unwrap();
        let serialized = account.to_string();

        assert_eq!(account["user"]["display_name"], "Kevin");
        assert_eq!(account["can_start_new_session"], true);
        assert_eq!(account["offline_grace_until"], "2026-10-03T10:00:00Z");
        for secret in ["session_token", "refresh_token", "opaque-session", "opaque-refresh"] {
            assert!(
                !serialized.contains(secret),
                "the webview must never receive {secret}"
            );
        }
    }

    #[test]
    fn debug_local_auth_is_explicit_and_supplies_two_active_workspaces() {
        let now = at("2026-08-06T10:00:00Z");
        assert!(!development_auth_enabled(None));
        assert!(!development_auth_enabled(Some("true")));
        assert!(development_auth_enabled(Some(" 1 ")));
        assert_eq!(development_account_for(false, now), None);

        let account = development_account_for(true, now).unwrap();
        assert_eq!(account.user.id, "local-developer");
        assert_eq!(account.user.display_name, "Local Developer");
        assert_eq!(account.memberships.len(), 2);
        assert!(account
            .memberships
            .iter()
            .all(|membership| membership.status.as_deref() == Some("active")));
        assert!(account.can_start_new_session);
        assert!(account.offline_grace_until > now);
    }

    #[test]
    fn a_missing_backend_url_is_reported_and_a_trailing_slash_is_tolerated() {
        // Serialised with the other env-reading test to keep the process-wide variable stable.
        let _guard = env_lock().lock().unwrap_or_else(|error| error.into_inner());

        env::remove_var("TESTLAB_API_BASE_URL");
        assert!(api_base_url().unwrap_err().contains("TESTLAB_API_BASE_URL"));

        env::set_var("TESTLAB_API_BASE_URL", "https://api.example.com/");
        assert_eq!(api_base_url().unwrap(), "https://api.example.com");
        env::remove_var("TESTLAB_API_BASE_URL");
    }

    #[test]
    fn the_configured_grace_window_rejects_nonsense_and_falls_back_to_the_default() {
        let _guard = env_lock().lock().unwrap_or_else(|error| error.into_inner());

        env::remove_var("TESTLAB_OFFLINE_GRACE_DAYS");
        assert_eq!(configured_grace_days(), DEFAULT_OFFLINE_GRACE_DAYS);

        env::set_var("TESTLAB_OFFLINE_GRACE_DAYS", "7");
        assert_eq!(configured_grace_days(), 7);

        for nonsense in ["0", "-3", "soon", ""] {
            env::set_var("TESTLAB_OFFLINE_GRACE_DAYS", nonsense);
            assert_eq!(configured_grace_days(), DEFAULT_OFFLINE_GRACE_DAYS);
        }
        env::remove_var("TESTLAB_OFFLINE_GRACE_DAYS");
    }

    fn env_lock() -> &'static std::sync::Mutex<()> {
        static LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
        &LOCK
    }
}
