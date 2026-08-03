# Feature Specification: QA Test Management Platform (Desktop + Mobile SDK)

**Feature Branch**: `001-test-management-platform`

**Created**: 2026-07-06

**Status**: Draft (revised)

**Input**: User description: Original brief described a no-database desktop QA tool (Tauri) with manual test-plan import/export and a Websocket-synced Mobile SDK for iOS and Android. The user then supplied a Claude Design project export (`QATools.zip`) containing authored requirements, architecture, connection-protocol, and roadmap documents that supersede that original framing (see Revision History below).

**Design reference**: `QATools.zip` (Claude Design project export). It contains design-canvas mockup source (`design-canvas.jsx`, `qa-runner.jsx`, `qa-test-cases.jsx`, `qa-test-plans.jsx`, `qa-log-inspector.jsx`, `qa-tokens.jsx`, `qa-ui.jsx`, `qa-icons.jsx`), screenshots, and — the authoritative source for this revision — four written requirement/architecture documents under `uploads/`: `qa-tool-requirements.md`, `system-architecture.md`, `sdk-tauri-connection.md`, `implementation-roadmap.md`, and `system-charts.md`. Those documents are treated as the source of truth for scope and business rules; the JSX mockup is treated as source of truth for presentation/UI-flow details only, and is used here just to corroborate terminology.

## Revision History

- **v1** (original prompt only): assumed no backend/database, manual Test Plan import/export as the only data-sharing mechanism, and a Mobile SDK covering both iOS and Android.
- **v2 (this revision)**: the uploaded requirements documents describe a materially different and more detailed product:
  - A **backend platform** (persistence, auth, workspaces, sync, realtime) is now in scope — "no database" no longer holds. Manual CSV/Excel *test case* import remains, but it supplements the backend rather than replacing it.
  - Mobile capture is **iOS-only for the MVP**; Android SDK support is an explicit non-goal for MVP (deferred to Phase 4). *(Overridden in this feature's `/speckit-clarify` session — see Clarifications below: the user has confirmed Android SDK support IS an MVP goal for this project, not deferred.)*
  - A **Web client** is a planned future surface, in addition to Desktop.
  - Device pairing has concrete, specified mechanics (QR code / manual pairing code, short-lived tokens, an `open`/`allowlist` device access policy) rather than being left open.
  - The bug-capture flow is a **non-blocking "Bug Occurred" marker** raised *during* a still-running session (it does not stop the session), which is distinct from ending the session via "Stop" and choosing a result (Passed / Failed / Blocked / Incomplete).
  - Diagnostic data capture is scoped to **API/network traffic** (request/response, headers, bodies, timing, errors) — the requirements documents do not describe logcat capture or a generic "phone info" bundle as in the original prompt; phone/platform identity is limited to a platform value and device ID.
  - This revision replaces the v1 user stories, functional requirements, key entities, and assumptions accordingly. Where the v1 brief and the uploaded documents conflict, the uploaded documents win.

## Clarifications

### Session 2026-07-06

- Q: What authentication method should the backend use for workspace users? → A: Target design should support both email/password and SSO, but for the MVP, defer real backend authentication — the app runs with local/implicit single-user access (no enforced login flow) for now.
- Q: What are the valid values for a Test Case's "status" field? → A: Status is a run-outcome enum — Not Run / Passed / Failed / Blocked — reflecting the case's current testing state. Separately, every Test Case also carries an independent Active/Archived lifecycle flag.
- Q: What are the valid severity levels for a Bug? → A: P0 / P1 / P2 / P3.
- Q: How should "platform" be modeled on a Test Case, and is build version needed at Test Case creation, and should duplicate titles be blocked? → A: A Test Case's platform is a choice of iOS, Android, or Both (not build-version-scoped). Build version is dropped from the Test Case entity entirely — it is not used at test-case creation. Duplicate Test Case titles are acceptable for the MVP; no automatic duplicate detection is required.
- Q: What role/permission boundaries should the MVP enforce among admin, lead, tester, developer, and viewer? → A: MVP only needs a single admin role (everyone effectively has full access); differentiated role permissions are a decision to be made after the MVP.
- Q: Should Android SDK support be part of the MVP, or deferred as the uploaded roadmap suggested? → A: Android SDK support IS an MVP goal — both iOS and Android capture SDKs are in scope for this feature's MVP, not just iOS.

### Session 2026-07-10

- Q: What does a Test Case's row-level `status` represent, given results are tracked per plan? → A: The status shown on a Test Case row is a derived summary aggregated across all of that case's per-plan instances (e.g., "Has Fail", "Blocked", "In Progress", "All Passed", "Not Run"); it is computed, not stored. Each Test Case × Test Plan instance carries its own authoritative Not Run/Passed/Failed/Blocked status, visible when the row is expanded.
- Q: What are the valid values for a Bug's status? → A: Open, In Progress, Resolved, Closed, Won't Fix (new bugs default to Open).
- Q: Where do captured session & API-log records durably live, given the backend can be unreachable mid-session? → A: General API logs are stored locally on the mobile device by the SDK and streamed to the desktop over WebSocket; they are working/live data that both the SDK and the desktop can clear, and are not durably persisted to the backend. Bugs (with their captured evidence/log window) are the exception: they are stored local-first and synced to the backend once a connection is available.
- Q: How is a bug's captured log window measured, and what is the default? → A: Time-based — N seconds before/after the bug marker's timestamp, configurable, defaulting to ±30 seconds.
- Q: How long is the desktop's pairing code/token valid? → A: Single-use with a 5-minute TTL — it expires on the first successful pairing or after 5 minutes, whichever comes first; refreshing the QR/code mints a new one.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Organize test cases and test plans (Priority: P1)

A QA Lead maintains a catalog of Test Cases (title, category/tag, status, platform, server) and groups them into Test Plans that represent a release, regression pass, or testing campaign. The same Test Case can belong to multiple Test Plans. The Lead can create, view, edit, and delete both Test Cases and Test Plans, and organize plans with notes and a target build.

**Why this priority**: Nothing else in the tool works without a way to author and organize test content — every other story (running tests, capturing bugs, reporting) operates on this data.

**Independent Test**: Can be fully tested by creating several Test Cases, grouping a subset into two different Test Plans (with one Test Case shared by both), and confirming both plans list the correct cases with correct summary information — without needing a device, session, or SDK at all.

**Acceptance Scenarios**:

1. **Given** no existing Test Cases, **When** the QA Lead creates a new Test Case with at least a title, category/tag, status, platform (iOS, Android, or Both), and server, **Then** the Test Case appears in the searchable Test Case list with that information visible.
2. **Given** a populated Test Case list, **When** the QA Lead filters by category, tag, status, platform, or server, or sorts by recently updated, title, status, or platform, **Then** the list updates accordingly without altering the underlying data.
3. **Given** an existing Test Case, **When** the QA Lead edits any of its fields, **Then** the system preserves audit metadata (created by, created at, updated by, updated at) reflecting the change.
4. **Given** a Test Case in active use, **When** the QA Lead deletes it and confirms, **Then** the case is removed from active lists but its references inside historical sessions remain intact and viewable.
5. **Given** an existing Test Case, **When** the QA Lead adds it to a second Test Plan, **Then** it appears in both plans without duplicating its underlying content, and each plan can track it independently (see Story 4 for per-plan status/results).
6. **Given** a Test Plan, **When** the QA Lead sets plan-level notes and a target build, or archives, or duplicates the plan, **Then** those changes are reflected without affecting other plans.

---

### User Story 2 - Pair a mobile device and run a manual test session (Priority: P2)

A QA Tester, from the desktop app, pairs a mobile device — iOS or Android, running a host app with the QA SDK embedded — by scanning a QR code or entering a short pairing code — no manual IP entry required for the default flow. Once paired, the tester selects a Test Plan (or ad hoc Test Cases), a build version, server, and platform, and starts a session. The desktop shows live API request/response traffic streamed from the device in real time while the tester performs the steps manually on the device.

**Why this priority**: This is the product's core value — turning manual mobile testing into a device-in-the-loop session with live API visibility — but it depends on Story 1's test content existing first.

**Independent Test**: Can be tested by pairing one iOS device and one Android device, each running the SDK, starting a session against one Test Plan on each, making a few API calls on the device, and confirming the desktop's live log viewer shows those requests in real time for both platforms and each session can be stopped with a recorded result.

**Acceptance Scenarios**:

1. **Given** a mobile device (iOS or Android) with the SDK's pairing screen open, **When** the tester scans the desktop's QR code or enters the desktop's short-lived pairing code, **Then** the device connects to the desktop and appears as a registered, enabled device with a stable device ID, its observed platform, and a user-defined display name.
2. **Given** the desktop's device access policy is set to `allowlist` (the default), **When** a device that has not been registered and enabled attempts to send records, **Then** the desktop rejects those records and they never reach the log viewer.
3. **Given** a registered and enabled device, **When** the tester selects a Test Plan (or ad hoc cases), build version, server, platform, and target device and clicks "Run", **Then** a session is created with a unique session ID and the desktop shows it as active.
4. **Given** an active session with the paired device making API calls, **When** those calls occur, **Then** the desktop's live log viewer shows each request/response (or in-progress request) without requiring the session to end first.
5. **Given** an active session, **When** the tester clicks "Stop", **Then** the desktop prompts for a result (Passed, Failed, Blocked, or Incomplete) and records it against the session.
6. **Given** a previously paired, trusted device, **When** it reconnects later, **Then** it reconnects automatically without repeating the full pairing flow, subject to the device still being enabled.
7. **Given** the desktop temporarily loses its connection to the backend, **When** a session is already running locally between the device and desktop, **Then** the session continues to operate and capture data without interruption.

---

### User Story 3 - Flag a bug during a session without stopping it (Priority: P3)

While a session is running, the tester notices a defect. They click "Bug Occurred," which records a bug marker in the session timeline and captures a window of log activity around that moment — all without stopping or otherwise disrupting the still-running session. The tester can keep testing and raise additional bug markers in the same session.

**Why this priority**: This is what turns a live traffic stream into an actionable bug record, but it only matters once a session (Story 2) is actually running.

**Independent Test**: Can be tested by starting a session, triggering "Bug Occurred" two or more times in a row while continuing to interact with the device, and confirming the session keeps running throughout, with each marker capturing a distinct, correctly time-windowed slice of log activity, plus at least a title, description, severity, and status recorded for each bug.

**Acceptance Scenarios**:

1. **Given** an active session, **When** the tester clicks "Bug Occurred," **Then** a bug marker is created in the session timeline, a window of logs around that timestamp is captured/bookmarked, and the session remains active and running.
2. **Given** a bug marker has just been created, **When** the tester fills in its title, description, and severity, **Then** the bug is saved with a link to the originating test case, session, plan, device, build version, and environment.
3. **Given** the tester taps "Bug Occurred" multiple times in quick succession, **When** each tap is processed, **Then** each produces its own distinct bug marker and log window rather than corrupting session state or merging unrelated events.
4. **Given** a bug has been recorded, **When** the tester later reviews it, **Then** they can see its evidence (timeline marker, log excerpt, and, if available, screenshot metadata) linked back to the session.

---

### User Story 4 - Review results, coverage, and history (Priority: P4)

A QA Lead reviews session history, pass/fail rates by plan, failed cases by build, and bugs by environment to understand overall coverage and quality trends, including per-Test-Case results across the plans that include it.

**Why this priority**: Valuable for oversight and process improvement, but it is a read-only view over data produced by Stories 1–3, so it has no standalone value until those exist.

**Independent Test**: Can be tested by running several sessions against one or more Test Plans with a mix of Passed/Failed/Blocked/Incomplete results and a few bug markers, then confirming the reporting views' pass/fail-by-plan, failed-cases-by-build, and bugs-by-environment figures match the underlying session data.

**Acceptance Scenarios**:

1. **Given** a Test Plan with a known set of completed sessions, **When** the QA Lead opens its reporting view, **Then** the displayed pass/fail rate matches the actual outcomes recorded for that plan.
2. **Given** a Test Case included in multiple Test Plans, **When** the QA Lead inspects that case, **Then** they can see its result independently per plan (not one merged status).
3. **Given** bugs recorded across multiple environments (e.g., Production, Staging, QA, Local), **When** the QA Lead opens the bugs-by-environment view, **Then** the counts reflect the actual environment recorded on each bug.
4. **Given** two devices running sessions concurrently, **When** the QA Lead reviews history, **Then** logs and results remain correctly isolated and attributable to the device and session that produced them.

---

### User Story 5 - Bulk-import test cases from a file (Priority: P5)

A QA Lead imports a batch of Test Cases from a structured file (CSV or Excel) instead of creating them one by one, reviewing a preview with row-level errors before committing the import.

**Why this priority**: Useful for onboarding an existing test suite or migrating from a spreadsheet, but the tool is fully usable without it (cases can be created manually per Story 1), and the source material explicitly treats bulk import as a later-phase enhancement rather than an MVP must-have.

**Independent Test**: Can be tested by importing a file containing a mix of valid rows and rows with missing required fields, and confirming the preview correctly flags the invalid rows while allowing the valid rows (including any that share a title with an existing Test Case) to be committed.

**Acceptance Scenarios**:

1. **Given** a well-formed CSV or Excel file of Test Cases, **When** the QA Lead imports it, **Then** a preview shows the rows to be created before anything is committed.
2. **Given** an import file with a row missing a required field or containing an invalid field value, **When** the preview is generated, **Then** that row is flagged with a specific, row-level error and is not silently imported.
3. **Given** an import file containing a row whose title matches an existing Test Case's title, **When** the preview is generated, **Then** the row is imported as a separate Test Case like any other row — duplicate titles are acceptable and are not flagged or blocked.

---

### Edge Cases

- What happens when an unregistered device (in `allowlist` mode) or a disabled device sends records? They must be rejected before reaching the log viewer, without deleting an existing disabled device's registration.
- What happens when a device is removed (not just disabled)? Future records from that device ID must be rejected until it is registered again from scratch.
- What happens if two different devices happen to present the same device ID? A device ID is a filtering/routing identifier, not proof of identity — the desktop must not treat allowlist membership alone as authentication; a separate short-lived pairing token/credential is required to establish trust.
- What happens if a malformed or invalid message arrives over the local connection? It must be discarded/rejected with a recorded diagnostic, not shown to the user as if it were valid data.
- What happens if the same event/record is received more than once (e.g., due to a reconnect retry)? The system must keep exactly one entry per unique event, not duplicate it.
- What happens if the device disconnects mid-session? The desktop must be able to detect the disconnect, allow reconnect (manual now, automatic later), and must not corrupt or silently discard already-captured session data.
- What happens if "Bug Occurred" is tapped repeatedly in fast succession? Session continuity must be preserved — no crash, no session termination, no merged/corrupted bug markers.
- What happens if live traffic volume is very high during a session? The log viewer must remain responsive (e.g., via truncation/virtualization strategies) rather than freezing or dropping the UI.
- What happens to sensitive data (auth headers, cookies, tokens, passwords, API keys) in captured requests/responses? It must be redacted before it is shown in the UI, stored, or transmitted anywhere.
- What happens when the backend is temporarily unreachable but a local device-to-desktop session is already underway? The local session must keep working; only backend-dependent features (e.g., cross-device history, sync) may be degraded.
- What happens when a Test Case referenced by a historical session is later deleted? The historical session and its recorded result must remain viewable and intact.

## Requirements *(mandatory)*

### Functional Requirements

**Workspace, roles, and access**

- **FR-001**: System MUST organize all data (test cases, plans, sessions, bugs, devices) within a workspace, isolating one workspace's data from another's.
- **FR-001a**: For the MVP, the system MAY grant workspace access without an enforced login flow (e.g., a single implicit local user per installation); the workspace/data model MUST NOT preclude adding real authentication later.
- **FR-001b**: When backend authentication is introduced (post-MVP), the system MUST support both email/password login and SSO for workspace users.
- **FR-002**: For the MVP, System MUST operate with a single admin-level role (effectively full access for the implicit local user); differentiated roles and permission boundaries (e.g., lead, tester, developer, viewer) are explicitly deferred to a post-MVP decision, once real authentication is introduced.

**Test Case management**

- **FR-003**: System MUST support full CRUD for Test Cases, each with at least a title, category/tag, platform, and server. A Test Case's run-status is derived (per FR-003a), not a stored field on the case. Test Cases do NOT carry a build version field.
- **FR-003a**: Run outcome MUST be tracked per Test-Case-in-a-Test-Plan instance: each instance's status MUST be one of Not Run, Passed, Failed, Blocked, updated as sessions record results against that instance, and visible when a Test Case row is expanded. The Test Case row itself MUST NOT store an independent run-outcome; instead it MUST display a **derived summary status** computed across all of that case's plan instances, with the following precedence: `Has Fail` (≥1 instance Failed) → `Blocked` (≥1 Blocked and none Failed) → `In Progress` (mix of Passed and Not Run, none Failed/Blocked) → `All Passed` (every instance Passed) → `Not Run` (no instance has a recorded result). This summary is computed on read, not persisted on the Test Case.
- **FR-003b**: A Test Case MUST additionally carry an independent lifecycle flag of Active or Archived, separate from its run-outcome status, so a case can be archived regardless of its last recorded outcome.
- **FR-003c**: A Test Case's platform MUST be one of: iOS, Android, or Both, representing which platform(s) the case is meant to be tested on.
- **FR-004**: System MUST provide a searchable Test Case list, filterable by category, tag, status, platform, and server, and sortable by recently updated, title, status, and platform.
- **FR-005**: System MUST preserve audit metadata on every Test Case (created by, created at, updated by, updated at) and update it on every edit.
- **FR-006**: System MUST support deleting a Test Case with confirmation, using soft delete so that references from historical sessions remain intact and viewable after deletion.
- **FR-007**: System MUST allow a Test Case to be included in more than one Test Plan without duplicating its core content.
- **FR-008**: System MUST support importing Test Cases from structured files (CSV or Excel), validating for missing required fields and invalid field values, and presenting a preview with row-level errors before committing the import. Duplicate Test Case titles (within an import file or against existing Test Cases) MUST NOT be blocked or flagged — duplicate titles are acceptable.

**Test Plan management**

- **FR-009**: System MUST support create, update, archive, and duplicate operations on Test Plans.
- **FR-010**: System MUST allow adding and removing Test Cases from a Test Plan, and support plan-level notes and a target build.
- **FR-011**: System MUST allow a Test Plan to be associated with the Test Cases, bugs, and sessions that reference it, plus a build version and an environment/server target.

**Manual Test Runner**

- **FR-012**: System MUST let a user start a session by selecting a Test Plan or ad hoc Test Cases, a build version, a server, a platform, and a target device, producing a session with a unique ID.
- **FR-013**: System MUST let the user record a "Bug Occurred" marker during an active session that creates a bug record, captures/bookmarks a window of log activity around that moment, and keeps the session running (this action MUST NOT stop or otherwise disrupt the running session).
- **FR-014**: System MUST let the user stop a session and MUST prompt for a result of Passed, Failed, Blocked, or Incomplete when they do.
- **FR-015**: System MUST identify each connected device by a stable device ID plus a user-defined display name.
- **FR-016**: System MUST support pairing a device via a QR code or a pairing code as the default connection flow, without requiring manual IP address entry in that default flow. A manual WebSocket/endpoint entry MAY remain available for development/troubleshooting but MUST NOT be the default flow presented to users.
- **FR-017**: System MUST support a configurable device access policy of `open` (accept from any reachable device) or `allowlist` (accept only from registered, enabled devices), with `allowlist` as the default.
- **FR-018**: System MUST let the user register a device with a display name, and enable or disable a registered device without deleting its registration; disabling MUST reject future records from that device without losing the registration, and removing a registration MUST require re-registration before that device's records are accepted again.
- **FR-019**: System MUST persist device registrations and their enabled/disabled state across desktop application restarts.
- **FR-020**: System MUST treat a device ID/allowlist membership as a filtering control only, not as authentication — establishing a trusted connection MUST rely on a separate, short-lived pairing token or credential.
- **FR-020a**: A pairing code/token MUST be single-use and MUST expire on the first successful pairing or after a 5-minute time-to-live, whichever comes first. Refreshing the QR/pairing code MUST mint a new token and invalidate the previous one. An expired or already-used token MUST be rejected.
- **FR-021**: System MUST support at least two concurrent, visible device sessions from one desktop instance, keeping each session's state and logs isolated by device and session ID.
- **FR-022**: System MUST show the observed source platform for a connected device once available.

**Mobile (iOS & Android) capture SDK**

- **FR-023**: The mobile SDK (iOS and Android) MUST capture, per API request made by the host app: request URL, HTTP method, headers, a request body preview, response status code, response headers, a response body preview, timestamps, duration, and any network or decoding error. Capture behavior MUST be equivalent across both platforms.
- **FR-024**: The mobile SDK MUST redact sensitive header and body fields (at minimum Authorization, Cookie, token, password, apiKey) before the data is stored or transmitted anywhere, on both iOS and Android.
- **FR-025**: The mobile SDK MUST stream captured events to the paired desktop in real time, including in-progress request state (not only fully completed request/response pairs), so the desktop can show a request before its response arrives.
- **FR-026**: The mobile SDK MUST buffer a short rolling backlog of events during brief disconnects and support reconnecting to a previously trusted desktop automatically where possible.
- **FR-027**: The mobile SDK MUST support an optional embedded debug UI (pairing screen, connection status, recent log summary, and quick actions to connect, reconnect, pause capture, and export recent logs) as well as a headless mode with no built-in UI, selectable by the host app.
- **FR-028**: The mobile SDK's embedded UI MUST expose a copyable device ID for use in manual allowlist registration on the desktop.
- **FR-029**: The mobile SDK MUST NOT block the host application's main thread while capturing traffic, on either platform.
- **FR-029a**: The desktop's live log viewer, device access policy, pairing flow, and reporting views MUST behave identically regardless of whether the connected device is iOS or Android.

**Bugs and evidence**

- **FR-030**: System MUST record, per bug: title, description, severity, status, related test case, related session, related plan, device, build version, and environment.
- **FR-030a**: A Bug's severity MUST be one of: P0, P1, P2, P3.
- **FR-030b**: A Bug's status MUST be one of: Open, In Progress, Resolved, Closed, Won't Fix. New bugs default to Open.
- **FR-031**: System MUST support attaching evidence to a bug: a timeline marker, a log excerpt captured around the event, and, when available, a screenshot or screenshot metadata.
- **FR-032**: System MUST make the captured log window's size configurable rather than fixed. The window is time-based — a number of seconds of log activity before and after the bug marker's timestamp — and MUST default to ±30 seconds.

**Reporting and history**

- **FR-033**: System MUST provide session history, pass/fail rate by plan, failed cases by build, bugs by environment, and API error patterns by session or device.
- **FR-034**: System MUST let a user view a Test Case's result independently for each Test Plan that includes it (not a single merged status across plans).

**Reliability and continuity**

- **FR-035**: System MUST keep a local device-to-desktop session operating and capturing data even when the backend is temporarily unreachable.
- **FR-035a**: The mobile SDK MUST store captured API logs locally on the device and stream them to the paired desktop over WebSocket. These general API logs are live working data: both the SDK and the desktop MUST be able to clear their API log, and the logs are NOT required to be durably persisted to the backend.
- **FR-035b**: Bugs, and the evidence captured with them (the bookmarked log window, timeline marker, and any screenshot metadata), MUST be persisted local-first and synced to the backend once a connection is available, so a bug raised while the backend is unreachable is retained and later becomes the durable, shareable record. Because bug evidence is captured at bug-creation time, clearing the general API log afterward MUST NOT remove a bug's already-captured log window.
- **FR-036**: System MUST discard malformed/invalid incoming messages (recording a diagnostic) rather than surfacing them as valid data, and MUST de-duplicate repeated deliveries of the same event so only one entry appears.

### Key Entities

- **Workspace**: Top-level tenant/organization boundary; owns users, test cases, tags, plans, sessions, bugs, and devices.
- **User**: A person acting within a workspace. For the MVP, effectively a single implicit admin-level user (no enforced login, no role differentiation); a role attribute (e.g., admin, lead, tester, developer, viewer) is reserved on the model for a post-MVP decision.
- **Test Case**: Canonical, reusable test content — title, description, an Active/Archived lifecycle flag, platform (iOS/Android/Both), server, tags — independent of any one Test Plan; can appear in many plans; no build version field, and duplicate titles are permitted. Its run-status is a **derived summary** (computed from its per-plan instance results, e.g., Has Fail / Blocked / In Progress / All Passed / Not Run), not a stored field.
- **Tag**: A label applied to Test Cases for categorization/filtering.
- **Test Plan**: A named, organized collection of Test Cases representing a release, regression pass, or campaign; carries notes and a target build; can be archived or duplicated.
- **Test Plan Item**: The membership link between a Test Plan and a Test Case; carries that case's per-plan instance status (Not Run/Passed/Failed/Blocked), typically reflecting the latest Session Case Result for the case within that plan.
- **Device**: A registered mobile device — ID, workspace, user-defined display name, observed platform, enabled/disabled state — distinct from any single connection/session.
- **Test Session**: One manual test run — workspace, device, who started it, start/stop time, build version, platform, server, and an overall result (Passed/Failed/Blocked/Incomplete) once stopped.
- **Session Case Result**: The per-Test-Case outcome (Not Run/Passed/Failed/Blocked) recorded within a session, allowing one case's result to be tracked independently per session/plan; it is the authoritative source the per-plan instance status and the case-level derived summary are computed from.
- **API Log Event**: A single captured request-lifecycle event (started, body captured, response received, failed, completed) tied to a session, device, and a shared request ID, with request/response summaries (redacted). Stored locally on the device by the SDK and streamed to the desktop over WebSocket; it is live working data that either side may clear, and is not durably persisted to the backend (contrast: Bug and Evidence, which are synced to the backend).
- **Bug**: A defect record — title, description, severity (P0/P1/P2/P3), status (Open/In Progress/Resolved/Closed/Won't Fix, default Open) — linked to the session, test case, plan, device, build version, and environment it was raised from, plus attached evidence.
- **Evidence**: Supporting material for a bug — a log excerpt/bundle, a timeline marker, and optionally a screenshot — captured around the bug's timestamp within a configurable time window (default ±30 seconds).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A QA Lead can create a Test Case and add it to a Test Plan in under 2 minutes without external documentation.
- **SC-002**: A tester can pair a new mobile device — iOS or Android — and see it appear as connected using only a QR scan or a short pairing code — no manual network address entry required for the default flow.
- **SC-003**: Once a session is active, an API call made on the paired device appears in the desktop's live log view within a couple of seconds, including showing it as "in progress" before its response arrives.
- **SC-004**: A tester can raise multiple "Bug Occurred" markers within a single session without the session ever stopping or losing previously captured data.
- **SC-005**: When the backend is unreachable, an already-running device-to-desktop session continues to capture and display data with no loss of in-session log or bug-marker data.
- **SC-006**: Sensitive fields (authorization headers, cookies, tokens, passwords, API keys) never appear unredacted in the log viewer, in storage, or in exported evidence, verified across a sample of captured requests containing such fields.
- **SC-007**: Reporting views (pass/fail rate by plan, failed cases by build, bugs by environment) match the underlying session and bug data with zero discrepancies when spot-checked.
- **SC-008**: An unregistered or disabled device's traffic never appears in the desktop's live log viewer while the workspace's access policy is set to `allowlist`.
- **SC-009**: Importing a file with a mix of valid and invalid Test Case rows results in only the valid rows being committed, with invalid rows clearly flagged before commit; rows that duplicate an existing title are committed normally, not flagged.

## Assumptions

- The MVP mobile capture surface covers **both iOS and Android**; this overrides the uploaded roadmap document's suggestion of an iOS-only MVP with Android deferred to Phase 4 — the user confirmed Android is required for this feature's MVP, not a later phase.
- A **Web client** is a planned future surface for test management, reporting, and collaboration, but is out of scope for this feature; the desktop app is the primary surface being specified here.
- Data persistence and cross-device history rely on a **backend platform** with a shared workspace-scoped data store; this supersedes the original "no database" assumption from the initial prompt. Real user authentication (email/password + SSO) against that backend is a **post-MVP** requirement — the MVP operates with local/implicit single-user workspace access and no enforced login flow.
- Local device-to-desktop live streaming (during an active session) works directly over a local connection independent of the backend, so live debugging stays fast even if the backend is briefly unavailable; only cross-session history/sync depends on the backend.
- A device ID and its allowlist status are filtering/routing controls, not authentication; establishing real trust between a device and a desktop additionally requires a short-lived pairing token issued by the desktop.
- "Bug Occurred" is a lightweight, in-session marker action distinct from ending the session; ending the session ("Stop") is the point at which an overall Passed/Failed/Blocked/Incomplete result is recorded.
- Bulk CSV/Excel import of Test Cases is a supplementary convenience feature, not required for the MVP's core create/organize/run/report loop, and may ship in a later phase per the supplied roadmap.
- Screenshot capture accompanying a bug is opportunistic/metadata-level in this revision, not a guaranteed or required capability for every bug.
- "Server" and "environment" are used interchangeably in the source material to describe the target backend/environment a test run is against (e.g., Production, Staging, QA, Local).
- Role differentiation (lead/tester/developer/viewer permission boundaries) is a post-MVP decision; the MVP treats every user as a single implicit admin-level role with full access.
- A Test Case's platform (iOS/Android/Both) describes intended test coverage; since both iOS and Android capture SDKs are in MVP scope, a case marked "Both" can be fully exercised with live SDK data on either platform.
