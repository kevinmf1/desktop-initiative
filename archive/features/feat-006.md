# feat-006 — Google SSO via system browser and PKCE loopback

- **Status:** ✅ done · closed 2026-08-03 · **Depends on:** feat-004
- **Epic:** Desktop app (Tauri) · **By:** kevin-malik
- **Requirements:** FR-001b, FR-051a

## Done when

- The signed-out desktop offers Google SSO only; no email/password form is present.
- Sign-in opens Google's authorization endpoint in the system browser, never an embedded webview.
- The desktop binds an ephemeral callback listener explicitly to `127.0.0.1` and closes it after
  one callback or a five-minute timeout.
- Authorization Code + PKCE uses a cryptographically random verifier, S256 challenge, `state`, and
  `nonce`; callback state is verified before a code is accepted.
- The code exchange sends the client ID, redirect URI, verifier, code, and authorization-code grant
  over HTTPS, with no client secret.
- The Google ID token and nonce remain in Rust memory for feat-007's backend/keychain handoff and
  are never returned to the webview.

## What landed

- `desktop/src-tauri/src/auth.rs`
  - system-browser OAuth entry via the existing Tauri opener plugin;
  - PKCE S256 material generated with OS cryptographic randomness;
  - bounded, single-use `127.0.0.1:0` callback listener with state, duplicate-query, path, and
    authorization-error validation;
  - public-client Google token exchange over rustls with no secret;
  - Rust-only one-time identity-proof handoff for feat-007;
  - six focused tests for PKCE, request shape, callback validation, loopback binding, and state.
- `desktop/src/App.tsx` adds the signed-out Google entry screen, pending state, and accessible error
  feedback; successful authorization enters the existing shell for the current process.
- `desktop/src/__tests__/App.test.tsx` covers successful command invocation and visible failures.
- `desktop/src-tauri/Cargo.toml` / `Cargo.lock` add the minimum cryptography, URL, HTTPS, randomness,
  and async-network support required by a native public-client OAuth flow.

## Evidence

| Check | Result |
|---|---|
| PKCE S256 matches RFC 7636 | `auth::tests::pkce_uses_the_rfc_7636_s256_vector` ✅ |
| Authorization URL carries loopback redirect, state, nonce, S256, and no secret | `auth::tests::authorize_url_has_native_pkce_parameters_and_no_secret` ✅ |
| Token exchange carries the verifier and no client secret | `auth::tests::token_exchange_is_a_public_client_request` ✅ |
| Invalid state and duplicate security parameters are rejected | `auth::tests::callback_rejects_invalid_state_and_duplicate_values` ✅ |
| Listener binds IPv4 localhost, accepts one callback, then closes | `auth::tests::loopback_listener_accepts_one_valid_callback_and_closes` ✅ |
| Parallel attempts are refused and proof stays in Rust | `auth::tests::auth_state_prevents_parallel_sign_ins_and_keeps_proof_in_rust` ✅ |
| UI invokes Rust auth and surfaces errors | `App.test.tsx` 2/2 ✅ |
| Full build gate | `HARNESS_VERIFY: PASS (build)` — 2026-08-03 |
| Full test gate | `HARNESS_VERIFY: PASS (test)` — 2026-08-03; Vitest 2/2, Rust 15/15 |

## Decision

This feature stops at a verified Google identity proof held in Rust memory. Backend session minting,
OS-keychain persistence, membership caching, offline grace, and sign-out belong to feat-007. The
one-time `take_identity_proof` handoff preserves that boundary without exposing the ID token to the
webview or discarding a successful authorization.
