# feat-014 — Device registry

- **Status:** ✅ done · closed 2026-08-06 · **Depends on:** feat-013
- **Epic:** Desktop app (Tauri) · **By:** kevin-malik
- **Requirements:** FR-015, FR-017, FR-018, FR-019, FR-022 (data-model *Device*, FR-020 for the
  filter/auth boundary)

## Done when

- A device is identified by its stable SDK-reported ID plus a user-defined display name (FR-015).
- The access policy is `open` or `allowlist` and defaults to `allowlist` (FR-017).
- A registration can be enabled/disabled without deleting it; disabled rejects future records;
  removal forces re-registration (FR-018).
- Registrations and their enabled state survive a desktop restart (FR-019).
- The observed source platform is shown once available (FR-022).

## What landed

- `desktop/src-tauri/src/device.rs` — the registry.
  - `Registry { policy, devices }` in `devices.json` under the app data dir; `AccessPolicy` defaults
    to `Allowlist`, and an absent/empty file reads back as an empty allowlist rather than an error
    (FR-017, FR-019).
  - `register()` — called after `ws::pairing::authorize()`. First pairing creates the row (display
    name defaults to the device ID); a later one refreshes only what the SDK reports. The display
    name, the `enabled` flag and `registered_at` are the operator's and are never overwritten, so a
    re-pair cannot silently re-enable a device somebody disabled (FR-018).
  - `admits()` — the `open`/`allowlist` filter feat-015 applies at the WS gate. Disabled rejects
    under **either** policy; unregistered is refused only under `allowlist` (FR-017, FR-018).
  - `reconnects()` — a returning device is recognised by SHA-256 of the credential
    `authorize()` minted, then still has to pass `admits()`. The plaintext credential is never
    written down; the desktop only ever needs to recognise, never to replay (FR-020).
  - `rename()` / `set_enabled()` / `remove()` + the five commands the webview calls.
  - `observed_platform` is `Option<ObservedPlatform>` and a handshake that omits it does not erase
    what was already seen (FR-022).
- `desktop/src-tauri/src/lib.rs` — `store_path(app, file)` hoisted here; `test_case.rs` and
  `test_plan.rs` had a byte-identical copy each and `device.rs` would have been a third.
- `desktop/src-tauri/src/ws/pairing.rs` — the doc on `Authorized` now names the three calls feat-015
  owes in order (reconnect check → `authorize()` → register + admit), so the gate cannot be wired
  half-way.
- `desktop/src/Devices.tsx` — a *Registered devices* panel under the pairing panel: policy select,
  one row per device (editable name over the stable ID, platform or "Not reported yet", what the
  row's state means for records, Disable/Enable, Remove), and an empty state. The panel says in
  words that the list filters and pairing is what establishes trust (FR-020).
- `desktop/src/App.tsx` — passes `workspaceId` to `Devices` and lets the screen own its scrolling.
- `desktop/src/__tests__/App.test.tsx` — the call-order assertion now waits instead of racing the
  landing screen's reads. It passed alone and failed under a fuller suite; see *Decisions*.

## Evidence

| Check | Result |
|---|---|
| Name + stable ID + observed platform, incl. "not reported yet" (FR-015, FR-022) | `Devices.test.tsx` › *lists a registered device by name, stable ID and observed platform* ✅ |
| Rename, and a refused rename snapping back (FR-015) | `Devices.test.tsx` › *renames a device and refuses an empty name* ✅ |
| Disable keeps the registration and rejects records (FR-018) | `Devices.test.tsx` › *disabling keeps the registration and says records are rejected* ✅ |
| Removal drops the registration (FR-018) | `Devices.test.tsx` › *removing a device drops the registration* ✅ |
| Policy defaults to allowlist, settable to open (FR-017) | `Devices.test.tsx` › *the access policy defaults to allowlist and can be set to open* ✅ |
| Admission wording under both policies (FR-017/018) | `Devices.test.tsx` › *the countdown, code grouping and admission wording hold at their boundaries* ✅ |
| Registration by stable ID with a renameable name (FR-015) | `device.rs` › `a_paired_device_is_registered_under_its_stable_id_with_a_renameable_name` ✅ |
| Disable rejects but keeps the row, under either policy (FR-018) | `device.rs` › `disabling_rejects_records_without_losing_the_registration` ✅ |
| Allowlist is the default; only `open` admits a stranger (FR-017) | `device.rs` › `the_default_policy_is_allowlist` ✅ |
| Removal forces a re-pair (FR-018) | `device.rs` › `removing_a_registration_forces_re_pairing` ✅ |
| Credential stored hashed, scoped per workspace + device (FR-020) | `device.rs` › `the_reconnect_credential_is_stored_hashed_and_checked_against_the_registry` ✅ |
| A re-pair keeps operator edits, refreshes observed facts (FR-018/022) | `device.rs` › `re_pairing_keeps_the_operator_s_edits_and_refreshes_the_observed_facts` ✅ |
| Persistence across a restart (FR-019) | `device.rs` › `the_registry_round_trips_through_its_stored_form` ✅ |
| Full build gate | `HARNESS_VERIFY: PASS (build)` — 2026-08-06 |
| Full test gate | `HARNESS_VERIFY: PASS (test)` — 2026-08-06; Vitest 41/41, Rust 54/54 |

FR-019 is proven at the store's serialized form, not by relaunching the app: the screen sits behind
Google sign-in, which still needs `GOOGLE_CLIENT_ID` / `TESTLAB_API_BASE_URL`. Same limitation as
feat-009…013 — the real component tree runs in jsdom.

## Decisions

**The registry filters; it never authenticates.** `admits()` runs *after*
`ws::pairing::authorize()` and answers a policy question. Nothing here can admit a device that did
not pair, and nothing here is what a device presents to prove itself (FR-020).

**The reconnect credential is stored as a SHA-256 hash.** The desktop only needs to *recognise* a
returning device; it never presents the credential to anyone. Storing the plaintext would add a
replayable secret at rest for no capability. `sha2` was already a dependency.

**Disabled beats `open`.** FR-017 and FR-018 could be read as "open admits everyone", which would
make disabling a no-op the moment somebody flips the policy. Disabling is an explicit decision about
one device; the policy is a default about unknown ones.

**The policy is app-wide, not per-workspace.** FR-017 asks for "a configurable device access
policy" and one desktop is one physical bench. Marked `ponytail:` — it becomes a per-workspace
column when a workspace needs a different answer than the machine it runs on.

**`store_path` was hoisted rather than copied a third time.** Two byte-identical private copies
already existed. feat-023 now has one function to replace instead of three.

**The flaky App test was fixed, not absorbed.** *a cached keychain session restores the workspace…*
asserted the IPC call list immediately after the heading rendered, so it passed alone and failed
under a fuller suite as the child screens' effects landed later. A `waitFor` makes the assertion
about the end state instead of the timing. A gate that fails at random is worse than no gate.

## Scope held

- **Nothing calls `register()` / `admits()` / `reconnects()` yet** — feat-015 owns the WS listener
  and is the only place a handshake exists. The three calls it owes are documented in order on
  `pairing::Authorized`.
- **`observed_platform` / `os_version` are never set by this feature.** The contract's `hello` does
  not carry them; `Observation` has the fields so feat-015 can fill them when the device reports
  (FR-022).
- **No manual device registration.** FR-018 says "register a device with a display name" —
  registration happens on pairing and the name is editable immediately, so an add-by-hand form would
  create rows no device can match.
