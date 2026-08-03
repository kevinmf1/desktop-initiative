# Quickstart & Validation Guide: QA Test Management Platform (v3)

Proves the feature works end-to-end. Each scenario maps to a spec acceptance scenario / success criterion. Details live in [data-model.md](data-model.md) and [contracts/](contracts/); this file is the run/validation guide, not implementation.

## Prerequisites

Each of the four projects builds independently (FR-000, SC-018) — you do **not** need all four to run most scenarios.

- **Desktop**: Rust (stable) + Node 20 → `cd desktop && npm install && npm run tauri dev`
- **Backend**: Go 1.24 → `cd backend && docker compose -f deploy/docker-compose.yml up -d` (PostgreSQL 16 + object store), then `go run ./api`
  - `go.work` binds `contracts`, `core`, `api`. Run `go work sync` after dependency changes.
  - Env: `DATABASE_URL`, `PORT`, `MEDIA_BUCKET`/`MEDIA_ENDPOINT` + credentials, `GOOGLE_CLIENT_ID`, `SESSION_TTL`, `OFFLINE_GRACE`. `core/config.go` fails fast on missing values — a clean boot *is* the config check.
  - Google setup: register a **Desktop/native** OAuth client. There is **no client secret** — the desktop is a public client using PKCE. Add `http://127.0.0.1` as an authorized redirect (loopback ports are wildcarded).
- **iOS SDK**: Xcode 15+, an **iOS 13+** device/simulator; add `sdk-ios` as an SPM dependency to a sample host app. Scenario 11 needs **two** sample hosts — one SwiftUI, one UIKit.
- **Android SDK**: Android Studio, an **API 23+** device/emulator; add the `sdk-android` AAR to a sample OkHttp host app.

Scenarios 6 and 10 exercise offline behaviour with the backend **stopped**.

## Setup

1. Start the desktop app and **sign in with Google** (Scenario A). Pick an active workspace; all subsequent scenarios operate within it.
2. Build and launch the sample host apps with the SDK in `overlay` mode.

---

## Scenario 0 — Four projects build independently *(FR-000 / SC-018)*

From a clean checkout, in any order, with the other three directories untouched:

```bash
cd backend && go build ./... && go test ./...
```

Repeat for `desktop`, `sdk-ios`, `sdk-android`.

**Expect**: each completes without another project present.

**Also verify the architectural boundary holds**: add an import of `core/internal/store` to any file in `api/` — it must **fail to compile**. That compile failure is the enforcement mechanism for "handlers never touch the database" (TC-001). If it compiles, the module split is wrong and the rest of the architecture is convention only.

## Scenario A — Google sign-in & multi-workspace *(FR-001a, FR-051…056, SC-021/023/024)*

1. Launch the desktop signed out → click **Sign in with Google**.

**Expect**: sign-in opens in the **system browser**, not an in-app window. An embedded webview would be rejected by Google with `disallowed_useragent` — if you see the Google page inside the app, the implementation is wrong.
2. Complete sign-in → the browser returns to `http://127.0.0.1:<port>/callback` and the app takes over.
3. **Expect**: the app shows your workspaces. With membership in three, all three are listed and switchable.
4. Switch between workspaces → each shows only its own test content, devices, sessions and bugs. Zero leakage (SC-021).
5. **Direct API check** — with a valid session token, call the API with a `workspace_id` you are *not* a member of:

**Expect**: **`403`**. A missing/expired token gives **`401`**. Scoping must be enforced server-side, not merely absent from the UI (FR-056b, SC-023) — this is the check an attacker performs first.
6. Change the Google account's email address, sign in again → **same User, memberships intact** (SC-024). Identity keys on the provider's stable subject, not email.
7. Start a session, then attempt to switch workspaces → **refused with a clear reason** (FR-056d). Confirm a device paired in workspace A does not appear in workspace B (FR-056c).

## Scenario B — Offline grace *(FR-053/053a, SC-022 — the Principle III guarantee)*

1. Sign in once while online.
2. **Disconnect the machine from the network entirely** — not just the backend, the whole network.
3. Run a complete workflow: pair a device, start a session, capture traffic, raise a bug, stop with a result.

**Expect**: everything works, **with no sign-in prompt** and no degradation beyond the absence of sync. This is the guarantee that makes auth compatible with local-first; if the app prompts to sign in here, D3's resolution is not implemented (SC-022).
4. Reconnect → queued records sync; no duplicates.
5. Simulate grace expiry (set `offline_grace_until` in the past) while a session is **running**.

**Expect**: the running session continues to completion and its data is retained. Only starting a **new** session asks for re-authentication (FR-053a). An interruption here would be a defect, not a security feature.
6. Revoke a membership server-side while the desktop is offline, then reconnect.

**Expect**: that workspace's queued records are rejected with a distinguishable reason, and the desktop **surfaces it** rather than silently dropping the queue.

## Scenario 1 — Author test cases & plans *(US1 / FR-003…011)*

1. Create 3 Test Cases (title, tag, platform ∈ {iOS, Android, Both}, server).
2. Create two Test Plans; add the same case to **both**.
3. **Expect**: the shared case appears in both plans without duplication; each plan tracks it independently. The Test Case row shows a **derived** summary status of `Not Run`. Editing updates audit metadata.
4. Delete a case and confirm → it leaves active lists but stays resolvable in history (soft delete).

**Pass**: SC-001; derived summary matches FR-003a.

## Scenario 2 — Pair a device & run a session *(US2 / FR-012…022, SC-002/003)*

1. Desktop runner → "Add device" → QR + short code appear (single-use, 5-min TTL).
2. On iOS, scan the QR. On Android, enter the numeric code.
3. Start a session against a plan. The device shows a **test-case prompt** listing the case's constraints → tap **Accept** (FR-012a); the on-device active-test banner appears (FR-012b).
4. Make API calls in each host app.
5. Stop a session → prompted for a result (Passed/Failed/Blocked/Incomplete); it is recorded.

**Expect**: both devices register as enabled with a stable ID, observed platform, and display name — no manual IP entry. Live requests reach the desktop within ~2s including an **in-progress** row before the response, isolated per device/session (FR-021).
6. Repeat step 3 and tap **Decline** → the desktop is told, and no capture starts against that case.
7. Refresh the QR → the previous token is rejected (FR-020a).

**Pass**: SC-002, SC-003.

## Scenario 3 — Action-grouped inspection *(US3 / FR-039…039i, SC-010/011)*

1. With capture running, perform exactly three interactions: **a tap** firing one request, **a pull-to-refresh** firing several, and **a scroll** firing none.
2. View the inspector in grouped mode, on both the device overlay and the desktop.

**Expect**: three groups with correct labels and the right requests under each — including an **empty group for the scroll** (FR-039d). Toggling to flat chronological loses no records; toggling back restores grouping. A status filter hides groups left with no matches (FR-039e).
3. Trigger a background poll with no interaction → it appears under **Unattributed**, neither misattributed nor dropped (FR-039c).
4. Type into a password field → an action is recorded with **no content captured** (FR-039g).
5. Fire two taps faster than their responses return → each request is attributed to the tap that **started** it, not the most recent one (FR-039a). This is the attribution rule most likely to be implemented backwards.

**Pass**: SC-010 (≥95% attribution over a 20-interaction script, nothing silently dropped), SC-011 (identify the causing interaction for a failed request in <15s).

## Scenario 4 — Flag bugs mid-session *(US4 / FR-013, FR-030…032)*

1. With a session running, tap "Bug Occurred" **twice** in quick succession while continuing to use the device.
2. **Expect**: two distinct markers, each capturing a ±30s window; the session **never stops**; no markers merge.
3. Fill title/description/severity (P0–P3); status defaults to `Open`. Save.
4. **Expect**: evidence includes the **preceding user actions** alongside the log excerpt (FR-031) — a developer reading the bug sees what was done, not only what was requested.
5. Clear the general log, then reopen a bug → its evidence is intact, because the window was **copied, not referenced** (FR-035b).

**Pass**: SC-004.

## Scenario 5 — Reporting & history *(US7 / FR-033/034, SC-007)*

1. Run several sessions with a mix of results and a few bugs across environments (Production/Staging/QA/Local).
2. Open reporting: pass/fail by plan, failed cases by build, bugs by environment.

**Expect**: every figure matches the underlying data exactly. A shared case shows its result **independently per plan** (FR-034).

**Pass**: SC-007.

## Scenario 6 — Backend outage resilience *(FR-035, SC-005)*

1. **Stop the backend.** Run a full session: pair, capture, raise a bug, stop with a result.

**Expect**: everything works, with no user-facing failure — a `503` is a non-event. Bugs queue in the desktop outbox.
2. Restart the backend → the outbox drains; no duplicate rows. A replay returns `status:"duplicate"` with `200`, **not** `409` — conflating those would make every reconnect look like a conflict.

**Pass**: SC-005.

## Scenario 7 — Redaction *(Principle I, FR-024/036a/037b, SC-006)*

1. Make requests carrying `Authorization`, `Cookie`, `token`, `password`, `apiKey` in headers **and** nested JSON bodies, on both platforms. Write app logs containing a token.
2. **Expect**: `«redacted»` everywhere — device overlay, desktop viewer, stored evidence, exports, backend rows — in traffic **and app logs**. Run the `conformance/` suite: iOS and Android produce byte-identical redacted frames.
3. Now bypass the SDK and `POST` a planted unredacted field straight to `/v1/sync/batch`.

**Expect**: **`422`** from `core/redaction`. Source redaction is the real gate; this proves the backup exists independently.

**Pass**: SC-006; Principles I + II.

## Scenario 8 — Access policy *(FR-017/018, SC-008)*

1. Ensure policy = `allowlist` (default). Disable a registered device without deleting it.
2. From that device, attempt to send records.

**Expect**: rejected before reaching the viewer, registration preserved. A never-registered device is likewise rejected. Re-enable → records flow again. Remove the registration → re-registration is required before records are accepted.

**Pass**: SC-008.

## Scenario 9 — App logs & crash history *(US6 / FR-037, FR-038…038b)*

1. Emit logs at every level through the SDK facade **and** through the platform logger.
2. **Expect**: the app-log tab shows all levels with tag filtering and untruncated detail. Facade logs always appear; platform logs appear within the documented matched boundary.
3. Force a crash in the host app. Relaunch.

**Expect**: the crash appears in crash history **after restart**, with stack trace and the surrounding API/app-log window.
4. Repeat with a third-party crash reporter (Crashlytics/Sentry) also installed → **it still receives the crash** (FR-038b). If it does not, handler chaining is broken and the SDK is unshippable into real host apps.
5. Unpaired from any desktop, confirm the overlay still shows live traffic, opens an entry's detail, and **copies it as cURL** (FR-027c).

**Pass**: SC-016.

## Scenario 10 — Screenshots & media evidence *(US5 / FR-040…048)*

1. With **no session running**, take a screenshot from the overlay → it lands in the capture library with metadata, reviewable and shareable, without pairing to any desktop (SC-012).
2. Open the overlay so it is visible, then capture → the **overlay is absent** from the image (FR-046).
3. Start a session, capture again → linked to session + active test case.
4. Attach a capture to a bug **with the backend stopped** → the Bug syncs anyway; the capture shows **pending upload**, not "no evidence" (FR-044a/b).
5. Restart the backend → the capture uploads and reaches `stored`.
6. Interrupt an upload mid-transfer → it resumes from the last acked offset, and the capture stays `pending` until the checksum verifies. No truncated object is ever linked as complete.
7. From another machine, with the originating device and desktop offline, open the bug → the evidence is viewable (SC-013a).
8. Fill the library past 500 MB → oldest **unattached** captures evict; a bug-attached capture is never evicted (FR-047).

> Screen recording is **not** exercised here — it is gated behind spike EX-001. No recording control should be present in the overlay at all (FR-050b: no inert affordances).

## Scenario 11 — SwiftUI / UIKit parity and the OS floors *(FR-049/050, SC-015/018a)*

1. Run the **same scripted interaction sequence** against the SwiftUI sample host and the UIKit sample host.

**Expect**: identical overlay capability and identical captured record structure — same action classification, same labels, same attribution. Neither host required a root-view wrapper, a relayout, or an SDK subclass (FR-049b).
2. Repeat on a device at **iOS 13** and one at **API 23**.

**Expect**: the full core capture set still works — API traffic, app logs, actions, crashes, screenshots, overlay (FR-050a). Where an enhancement is unavailable (`OSLogStore` below iOS 15, `PixelCopy` below API 24) the baseline path covers it, and nothing is presented as working while doing nothing.

**Pass**: SC-015, SC-018a.

## Scenario 12 — Contract version compatibility *(FR-000c…e, SC-019/020)*

1. Pair a desktop build **one contract-minor ahead** of the device's SDK.

**Expect**: pairs and runs a full session. Unknown fields are ignored without error. Any desktop-only capability shows as **unavailable-for-this-device with a reason** — not hidden, not silently inert.
2. Pair a peer **one contract-major behind**.

**Expect**: refused at handshake with a message naming which side is out of date, and **no partial connection state**. Partial connection is the failure mode that would otherwise corrupt data.
3. Repeat against the sync API (`X-Contract-Version`): minor-ahead serves; major mismatch returns `426`.

**Pass**: SC-019, SC-020.

## Scenario 13 — Bulk import *(US8 / FR-008, SC-009)*

1. Import a CSV/Excel with valid rows, rows missing required fields, and a row duplicating an existing title.

**Expect**: the preview flags invalid rows with row-level errors; valid rows — including the duplicate-title row — commit; the duplicate is **not** flagged.

**Pass**: SC-009.

---

## Traceability summary

| Scenario | User Story | Key FRs | Success Criteria |
|---|---|---|---|
| A | — | FR-001a, FR-051…056 | SC-021, SC-023, SC-024 |
| B | — | FR-053/053a | SC-022 |
| 0 | — | FR-000, TC-001 | SC-018 |
| 1 | US1 | FR-003…011 | SC-001 |
| 2 | US2 | FR-012…022 | SC-002, SC-003 |
| 3 | US3 | FR-039…039i | SC-010, SC-011 |
| 4 | US4 | FR-013, FR-030…032 | SC-004 |
| 5 | US7 | FR-033/034 | SC-007 |
| 6 | — | FR-035/036 | SC-005 |
| 7 | — | FR-024, FR-036a, FR-037b | SC-006 |
| 8 | US2 | FR-017/018 | SC-008 |
| 9 | US6 | FR-037/038, FR-027 | SC-016 |
| 10 | US5 | FR-040…048 | SC-012, SC-013a |
| 11 | US2/US6 | FR-049/050 | SC-015, SC-018a |
| 12 | — | FR-000c…e | SC-019, SC-020 |
| 13 | US8 | FR-008 | SC-009 |

**Deliberately uncovered**: SC-013 (recording interruption) and SC-014 (15-minute integration, measured during SDK onboarding rather than here). SC-017 (no perceptible host degradation) stays qualitative pending a device baseline — flagged in the plan as the one Technical Context item worth quantifying at `/speckit-tasks` time.
