# feat-007 — Auth Session in the OS keychain, cached memberships, offline grace, sign-out

- **Status:** ✅ done · closed 2026-08-04 · **Depends on:** feat-006
- **Epic:** Desktop app (Tauri) · **By:** kevin-malik
- **Requirements:** FR-052a, FR-053, FR-053a, FR-054

## Done when

- The Google identity proof from feat-006 is exchanged with our backend for an opaque session
  credential; the credential and the membership snapshot are cached in the OS keychain.
- No Google-issued token is ever the session credential, cached, or forwarded anywhere but the
  single `POST /v1/auth/google` call.
- Launch reads the keychain and makes **no** auth network call, so a fully offline desktop with a
  cached session opens straight into the workspace.
- The offline grace window defaults to 30 days and is configurable; a value sent by the backend wins.
- Grace expiry gates **only** starting a new Test Session — it never interrupts a running one and
  never blocks reading locally captured data.
- Sign-out always clears the local credential and cached workspace snapshot, even when the backend
  is unreachable, and deletes nothing already synced.

## What landed

- `desktop/src-tauri/src/auth_session.rs` — new module (named for the data-model's "Auth Session",
  which shares no key with "Test Session"):
  - `CachedSession` / `CachedUser` / `CachedMembership` — the keychain record: backend session +
    refresh token, `issued_at`, `expires_at`, `offline_grace_until`, user, membership snapshot;
  - `establish()` — `POST /v1/auth/google` with `id_token` + `nonce` only, then cache;
  - `cached_account` command — the launch path, keychain-only, zero network calls;
  - `sign_out` command — reads, **clears unconditionally**, then revokes best-effort;
  - `can_start_new_session()` — the single predicate grace expiry is allowed to gate;
  - `grace_deadline()` / `configured_grace_days()` — backend value wins, else `issued_at` + the
    configured days, else 30;
  - `Account` — the redacted view for the webview; carries no token of any kind;
  - eleven tests covering the contract response, grace defaulting and configuration, the
    new-session-only gate, token isolation, the mint request shape, and the keychain round-trip.
- `desktop/src-tauri/src/auth.rs` — `sign_in_with_google` now returns `Account`, consuming the
  identity proof through the existing Rust-only handoff so it still never crosses the IPC boundary.
- `desktop/src-tauri/src/lib.rs` — registers `cached_account` and `sign_out`.
- `desktop/src-tauri/Cargo.toml` — `keyring` 4 (default features are the three real native stores;
  a commented warning records that disabling them silently falls back to an in-memory store) and
  `time` with `serde-well-known` (already in the dependency graph).
- `desktop/src/App.tsx` — restore-from-keychain on mount, `Account` type, account footer with
  sign-out in the rail, and the Runner's re-authentication gate for expired grace.
- `desktop/src/__tests__/App.test.tsx` — 7 tests: cached restore with no sign-in, signed-out
  fallback, expired grace reaching every other screen but gating Runner, sign-out, and a sign-out
  that could not clear the credential.

## Evidence

| Check | Result |
|---|---|
| Contract response parses; backend grace window wins | `auth_session::tests::contract_response_parses_and_the_backend_grace_window_wins` ✅ |
| Grace defaults to 30 days when the backend omits it | `auth_session::tests::offline_grace_defaults_to_thirty_days_when_the_backend_omits_it` ✅ |
| Grace window is configurable, backend value still wins | `auth_session::tests::the_grace_window_is_configurable` ✅ |
| Bad `TESTLAB_OFFLINE_GRACE_DAYS` falls back to 30 | `auth_session::tests::the_configured_grace_window_rejects_nonsense_and_falls_back_to_the_default` ✅ |
| Expiry gates only a new session; user + memberships stay readable | `auth_session::tests::grace_expiry_only_gates_starting_a_new_session` ✅ |
| Cached credential is the backend token; ID token absent from the blob | `auth_session::tests::the_cached_credential_is_the_backend_token_and_never_the_google_id_token` ✅ |
| Mint request forwards only `id_token` + `nonce` | `auth_session::tests::the_mint_request_forwards_only_the_google_proof` ✅ |
| Keychain record round-trips | `auth_session::tests::the_keychain_record_round_trips` ✅ |
| Webview view carries no tokens | `auth_session::tests::the_account_view_never_exposes_tokens` ✅ |
| Missing `TESTLAB_API_BASE_URL` reported; trailing slash tolerated | `auth_session::tests::a_missing_backend_url_is_reported_and_a_trailing_slash_is_tolerated` ✅ |
| Offline restore, grace gate, sign-out, failed sign-out in the UI | `App.test.tsx` 7/7 ✅ |
| Runner gate rendered in the running app | Vite preview: Runner shows *"Sign in again to start a new session"* with grace-end date, all six other screens reachable |
| Full build gate | `HARNESS_VERIFY: PASS (build)` — 2026-08-04, no warnings |
| Full test gate | `HARNESS_VERIFY: PASS (test)` — 2026-08-04; Vitest 7/7, Rust 25/25 |

## Decisions

**`keyring` 4 with default features.** v4's default `v1` feature pulls in Apple Keychain, Windows
Credential Manager and Secret Service together, so the native store is on by default. v3 required
naming each platform feature and silently falls back to an in-memory store when none is set — a
credential that never reaches the keychain while every test still passes. Chosen for that reason,
not for novelty; a `Cargo.toml` comment records the hazard.

**`time`, not `chrono`.** `time` 0.3 was already in the dependency graph via Tauri, so the only cost
is the `serde-well-known` feature and its RFC 3339 (de)serializers. Lexicographic comparison of the
ISO-8601 strings was rejected: it happens to work for `Z`-form timestamps of equal precision and
breaks silently on offsets or fractional seconds.

**Sign-out clears before it revokes.** The local clear is unconditional and ordered first, so no
network failure path can leave the desktop signed in. If the *keychain* clear itself fails, the UI
stays signed in and shows the error rather than claiming a sign-out that the next launch would
silently undo.

**A malformed keychain record reads as signed-out.** A blob we can no longer parse yields `None`
instead of a hard error, so a future format change can never lock a user out of the app.

## Scope held

`can_start_new_session` is the gate; **enforcing** it at session start is feat-016's, which owns the
runner. This feature expresses it where the runner will live — the Runner screen's re-authentication
state — so the FR-053a invariant is visible and tested without pre-building feat-016. Likewise the
membership snapshot is cached and returned but the workspace **switcher** is feat-008's, and
`POST /v1/auth/refresh` goes unused until something needs renewal.
