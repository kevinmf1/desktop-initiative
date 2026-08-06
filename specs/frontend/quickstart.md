# Quickstart & Validation Guide (Desktop): QA Test Management Platform (v3)

Proves the desktop app works. Each scenario maps to a spec acceptance scenario / success criterion and is the desktop-scoped view of the umbrella guide ([../001-test-management-platform/quickstart.md](../001-test-management-platform/quickstart.md)). Details live in [data-model.md](data-model.md) and [contracts/](contracts/); this file is the run/validation guide, not implementation.

Each scenario is tagged with what it needs:

- **[alone]** — the desktop validates it with no other project present.
- **[peer: SDK]** — needs a paired mobile device running an SDK (iOS or Android) to stream capture.
- **[peer: backend]** — needs the Go backend running.

## Prerequisites

The desktop builds independently (FR-000, SC-018) — you do **not** need the other three projects to run the **[alone]** scenarios.

- **Desktop**: Rust (stable) + Node 20 → `cd desktop && npm install && npm run tauri dev`
- **Tests**: `cargo test` (Rust core) + Vitest (webview UI).
- **Targets**: macOS 12+, Windows 10+, Linux.

Optional peers, only for the tagged scenarios:

- **Backend** (for A, B seeding, 6): Go 1.24 → `cd backend && docker compose -f deploy/docker-compose.yml up -d` then `go run ./api`. It needs `GOOGLE_CLIENT_ID` and storage/DB config. Google setup: register a **Desktop/native** OAuth client — there is **no client secret** (the desktop is a public PKCE client); add `http://127.0.0.1` as an authorized redirect (loopback ports are wildcarded).
- **SDK** (for 2, 3, 4, 8, and end-to-end 6): a sample host app on an **iOS 13+** or **API 23+** device/emulator with the SDK in `overlay` mode.

Scenario 6 and the offline portion of B exercise behaviour with the backend **stopped**.

## Setup

1. Start the desktop app. For **[alone]** scenarios you can work locally; for A/B first **sign in with Google** (Scenario A), then pick an active workspace — all subsequent scenarios operate within it.
2. For **[peer: SDK]** scenarios, build and launch a sample host app with the SDK.

### Local development auth (debug builds only)

To manually exercise authenticated **[alone]** scenarios without Google or a backend, launch the
Tauri development build with the explicit local-auth flag:

```bash
cd desktop
TESTLAB_DEV_AUTH=1 npm run tauri dev
```

PowerShell equivalent:

```powershell
cd desktop
$env:TESTLAB_DEV_AUTH = '1'
npm run tauri dev
```

The app opens as `Local Developer` with `Local Workspace Alpha` and `Local Workspace Beta`; this
also gives Rust commands the same identity for audit fields. The flag is accepted only by debug
builds and needs neither `GOOGLE_CLIENT_ID` nor `TESTLAB_API_BASE_URL`. Unset it and restart to use
the normal cached-session/Google flow.

This mode proves only local desktop behaviour. Scenario A still requires Google + backend; sync and
upload checks require the backend; device streaming checks require an SDK peer.

---

## Scenario 0 — Desktop builds independently *(FR-000 / SC-018)* **[alone]**

From a clean checkout, with the other three directories untouched:

```bash
cd desktop && npm install && npm run tauri dev   # runs
cargo test                                        # Rust core tests pass
npx vitest run                                    # webview tests pass
```

**Expect**: the desktop builds, runs, and its tests pass with no `backend/`, `ios/`, or `android/` present. If any of them is required to build or test, the four-project split (FR-000) is broken for the desktop.

## Scenario A — Google sign-in & multi-workspace *(FR-001a, FR-051…056, SC-021/023/024)* **[peer: backend]**

1. Launch the desktop signed out → click **Sign in with Google**.

**Expect**: sign-in opens in the **system browser**, not an in-app window. An embedded webview would be rejected by Google with `disallowed_useragent` — if you see the Google page inside the app, the implementation is wrong (research R19).
2. Complete sign-in → the browser returns to `http://127.0.0.1:<port>/callback` and the app takes over. The desktop verifies `state`, exchanges the code with **no client secret**, sends the ID token to the backend, and caches the backend-minted session + membership snapshot in the OS keychain.
3. **Expect**: the app shows your workspaces. With membership in three, all three are listed and switchable.
4. Switch between workspaces → each shows only its own test content, devices, sessions, and bugs. Zero leakage (SC-021).
5. **Direct API check** — with a valid session token, call the API with a `workspace_id` you are *not* a member of.

**Expect**: **`403`**. A missing/expired token gives **`401`**. Scoping is enforced server-side, not merely absent from the desktop UI (FR-056b, SC-023).
6. Change the Google account's email, sign in again → **same User, memberships intact** (SC-024). Identity keys on the provider's stable subject, not email.
7. Start a session, then attempt to switch workspaces → **refused with a clear reason** (FR-056d). Confirm a device paired in workspace A does not appear in workspace B (FR-056c).

## Scenario B — Offline grace *(FR-053/053a, SC-022 — the Principle III guarantee)* **[peer: backend for the one-time sign-in, then alone offline]**

1. Sign in once while online (seeds the cached session + memberships).
2. **Disconnect the machine from the network entirely** — not just the backend, the whole network.
3. Run a complete workflow (with an SDK peer if available, otherwise exercise the desktop-side steps you can): pair a device, start a session, capture traffic, raise a bug, stop with a result.

**Expect**: everything works, **with no sign-in prompt** and no degradation beyond the absence of sync. If the app prompts to sign in here, D3's resolution is not implemented (SC-022).
4. Reconnect → queued records sync from the outboxes; no duplicates.
5. Simulate grace expiry (set `offline_grace_until` in the past) while a session is **running**.

**Expect**: the running session continues to completion and its data is retained. Only starting a **new** session asks for re-authentication (FR-053a).
6. Revoke a membership server-side while the desktop is offline, then reconnect.

**Expect**: that workspace's queued records are rejected with a distinguishable reason, and the desktop **surfaces it** rather than silently dropping the queue (R20).

## Scenario 1 — Author test cases & plans *(US1 / FR-003…011, SC-001)* **[alone]**

1. Create 3 Test Cases (title, tag, platform ∈ {iOS, Android, Both}, server).
2. Create two Test Plans; add the same case to **both**.
3. **Expect**: the shared case appears in both plans without duplication; each plan tracks it independently. The Test Case row shows a **derived** summary status of `Not Run`. Editing updates audit metadata.
4. Delete a case and confirm → it leaves active lists but stays resolvable in history (soft delete).

**Pass**: SC-001; derived summary matches FR-003a.

## Scenario 2 — Pair a device & run a session (desktop side) *(US2 / FR-012…022, SC-002/003)* **[peer: SDK]**

1. Desktop runner → "Add device" → QR + short code appear (single-use, 5-min TTL). The QR encodes `{ws_url, token, contract_version}` (research R4).
2. From the SDK peer, scan the QR (or enter the numeric code).
3. Start a session against a plan. The desktop pushes a **test-case prompt** to the device; capture against a case begins only after the device sends Accept (FR-012a).
4. Make API calls in the host app.
5. Stop the session → the desktop prompts for a result (Passed/Failed/Blocked/Incomplete) and records it.

**Expect (desktop side)**: the device registers as enabled with a stable ID, observed platform, and display name — no manual IP entry. Live requests reach the desktop viewer within ~2s including an **in-progress** row before the response, isolated per device/session (FR-021). Support ≥2 concurrent device sessions.
6. Repeat step 3 and Decline on the device → the desktop is told, and no capture starts against that case.
7. Refresh the QR → the previous token is rejected at the WS gate (FR-020a).

**Pass**: SC-002, SC-003.

## Scenario 3 — Action-grouped inspection (desktop inspector) *(US3 / FR-039…039i, SC-010/011)* **[peer: SDK]**

1. With capture running, perform exactly three interactions on the device: **a tap** firing one request, **a pull-to-refresh** firing several, and **a scroll** firing none.
2. View the desktop inspector in grouped mode.

**Expect**: three groups with correct labels and the right requests under each — including an **empty group for the scroll** (FR-039d). Toggling to flat chronological loses no records; toggling back restores grouping. A status filter hides groups left with no matches (FR-039e).
3. Trigger a background poll with no interaction → it appears under **Unattributed**, neither misattributed nor dropped (FR-039c).
4. Type into a password field on the device → an action is recorded with **no content captured** (FR-039g); the desktop shows the action but never any typed content.
5. Fire two taps faster than their responses return → each request is grouped under the tap that **started** it, not the most recent one (FR-039a). This is the attribution rule most likely to be implemented backwards.

**Pass**: SC-010 (≥95% attribution over a 20-interaction script, nothing silently dropped), SC-011 (identify the causing interaction for a failed request in <15s).

## Scenario 4 — Flag bugs mid-session *(US4 / FR-013, FR-030…032, SC-004)* **[peer: SDK]**

1. With a session running, click "Bug Occurred" **twice** in quick succession while the device keeps being used.
2. **Expect**: two distinct markers, each capturing a ±30s window; the session **never stops**; no markers merge.
3. Fill title/description/severity (P0–P3); status defaults to `Open`. Save.
4. **Expect**: evidence includes the **preceding user actions** alongside the log excerpt (FR-031) — copied, not referenced.
5. Clear the general log, then reopen a bug → its evidence is intact, because `log_window`/`action_window` were **copied at bug-creation time** (FR-035b, evidence independence).

**Pass**: SC-004.

## Scenario 5 — Reporting & history *(US7 / FR-033/034, SC-007)* **[alone]** (needs prior session/bug data)

1. With a spread of session results and a few bugs across environments (Production/Staging/QA/Local) already recorded, open reporting.
2. View: session history, pass/fail by plan, failed cases by build, bugs by environment.

**Expect**: every figure matches the underlying local data exactly. A shared case shows its result **independently per plan** (FR-034). Reporting is computable from desktop SQLite offline; the backend versions serve cross-device aggregation and must equal the same ground truth (SC-007).

**Pass**: SC-007.

## Scenario 6 — Backend outage resilience *(FR-035/036, SC-005)* **[peer: SDK + backend]**

1. **Stop the backend.** Run a full session: pair, capture, raise a bug, stop with a result.

**Expect**: everything works, with no user-facing failure — a `503` is a non-event for the user. Bugs queue in the desktop **record outbox**; any attached media queues in the **separate media outbox**.
2. Restart the backend → both outboxes drain; no duplicate rows. A replay returns `status:"duplicate"` with `200`, **not** `409` — the desktop must treat `duplicate` as success. Conflating the two would make every reconnect look like a conflict.

**Pass**: SC-005.

## Scenario 8 — Access policy allowlist *(FR-017/018, SC-008)* **[peer: SDK]**

1. Ensure policy = `allowlist` (default). Disable a registered device without deleting it.
2. From that device, attempt to send records.

**Expect**: rejected at the WS gate **before** reaching the viewer, registration preserved. A never-registered device is likewise rejected (`nack`). Re-enable → records flow again. Remove the registration → re-registration is required before records are accepted.

**Pass**: SC-008.

## Scenario 12 — Contract version compatibility (desktop side) *(FR-000c…e, SC-019/020)* **[peer]**

1. Pair a desktop build **one contract-minor ahead** of the device's SDK.

**Expect**: pairs and runs a full session. Unknown fields/message types are **ignored** without error (FR-000d). Any desktop-only capability shows as **unavailable-for-this-device with a reason** — not hidden, not silently inert (FR-000e, FR-050b).
2. Pair a peer **one contract-major behind**.

**Expect**: refused at the WS handshake with a message naming which side is out of date, and **no partial connection state** (FR-000c, SC-020).
3. Repeat against the sync API (`X-Contract-Version`): a minor-ahead server serves; a major mismatch returns `426`.

**Pass**: SC-019, SC-020.

## Scenario 13 — Bulk import *(US8 / FR-008, SC-009)* **[alone]**

1. Import a CSV/Excel with valid rows, rows missing required fields, and a row duplicating an existing title.

**Expect**: the preview flags invalid rows with row-level errors before commit; valid rows — including the duplicate-title row — commit; the duplicate is **not** flagged or blocked.

**Pass**: SC-009.

---

## Traceability summary

| Scenario | Needs | User Story | Key FRs | Success Criteria |
|---|---|---|---|---|
| 0 | alone | — | FR-000 | SC-018 |
| A | backend | — | FR-001a, FR-051…056 | SC-021, SC-023, SC-024 |
| B | backend (once), then offline | — | FR-053/053a | SC-022 |
| 1 | alone | US1 | FR-003…011 | SC-001 |
| 2 | SDK | US2 | FR-012…022 | SC-002, SC-003 |
| 3 | SDK | US3 | FR-039…039i | SC-010, SC-011 |
| 4 | SDK | US4 | FR-013, FR-030…032 | SC-004 |
| 5 | alone | US7 | FR-033/034 | SC-007 |
| 6 | SDK + backend | — | FR-035/036 | SC-005 |
| 8 | SDK | US2 | FR-017/018 | SC-008 |
| 12 | peer | — | FR-000c…e | SC-019, SC-020 |
| 13 | alone | US8 | FR-008 | SC-009 |

**Not covered here (belong to SDK/backend folders)**: Scenario 7 (redaction — the real gate is at source + the backend 422; the desktop only re-scans defensively), 9 (app logs & crash history — SDK/overlay), 10 (screenshots & media capture on-device; the desktop's staging/upload side is exercised inside Scenarios 4 and 6), 11 (SwiftUI/UIKit parity & OS floors — SDK).
