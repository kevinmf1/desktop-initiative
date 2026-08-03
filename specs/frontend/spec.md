# Project Specification: Frontend — Desktop App (Tauri)

**Project**: 1 of 4 — Desktop application
**Tech stack**: Tauri 2.x (Rust core) + TypeScript / React (webview UI)
**Parent spec**: [../001-test-management-platform/spec.md](../001-test-management-platform/spec.md) — this file is a project-scoped view of the umbrella QA Test Management Platform spec (v3). Where this file and `the umbrella spec` disagree, `the umbrella spec` wins; this file exists to give the desktop team a self-contained scope without the SDK/backend detail.
**Last derived**: 2026-07-29

---

## Scope & Responsibilities

The desktop app is the QA team's primary workstation. It owns:

- **Test authoring** — full CRUD for Test Cases and Test Plans, bulk import, and search/filter/sort.
- **The live session runner** — pairing mobile devices, starting/stopping sessions, and showing streamed capture in real time.
- **The action-grouped log inspector** — the desktop half of the grouped/flat inspector.
- **Bug capture and evidence assembly** — the "Bug Occurred" marker, the configurable evidence window, and routing attached media to the backend.
- **Reporting and history** — pass/fail by plan, failed cases by build, bugs by environment.
- **Authentication and workspace switching** — Google SSO sign-in via the system browser, a cached session with offline grace, and the active-workspace selector.
- **Local-first durability** — a local SQLite store and a sync outbox so sessions survive a backend outage.

It hosts the **LAN WebSocket server** that mobile devices dial into, and is the **only** component that uploads bug media to the backend (devices never talk to the backend directly).

### Explicitly NOT in this project

- On-device capture of API traffic, app logs, crashes, user actions, screenshots → **iOS SDK** / **Android SDK**.
- Durable persistence, identity verification, session minting, membership enforcement, object storage → **backend**.
- The mobile overlay UI, on-device pairing screen, on-device session history → the two SDKs.

---

## Integration Contracts

The desktop participates in two of the three published, semantically-versioned contracts (`the umbrella spec` FR-000a):

| Contract | Role | Peer |
| --- | --- | --- |
| `contracts/device-desktop-ws.md` | **Server** — hosts the LAN WebSocket, runs the allowlist + token gate and the capability handshake | iOS / Android SDK |
| `contracts/sync-api.md` | **Client** — record outbox + separate media outbox to the backend REST API | Backend |

Contract-versioning rules the desktop must honour (`the umbrella spec` FR-000c–e):

- **FR-000c** — Two peers sharing the same contract **major** version MUST connect and operate; a **major** mismatch MUST refuse the connection and tell the user which peer is out of date and what to upgrade.
- **FR-000d** — Within a major, minors are **additive only**; the desktop MUST ignore fields/message types it does not recognise rather than erroring.
- **FR-000e** — The desktop MUST exchange contract version + supported capabilities at handshake, and MUST present any capability a paired device's older SDK lacks as *unavailable-for-this-device* with a reason — never silently absent, never silently degraded.

Delivery-structure requirements the desktop shares (`the umbrella spec`):

- **FR-000** — The desktop MUST be independently buildable, testable, and releasable without the other three projects present (**SC-018**).

---

## User Stories

### US1 — Organize test cases and test plans (P1) — **owned**

A QA Lead maintains a catalog of Test Cases and groups them into Test Plans; the same Test Case can belong to multiple plans.

**Independent test**: Create several Test Cases, group a subset into two plans (one case shared), and confirm both plans list the correct cases with correct summaries — no device, session, or SDK needed.

Acceptance scenarios 1–6 from `the umbrella spec` US1 apply in full to the desktop UI (create/filter/edit/delete/multi-plan/plan-notes).

### US2 — Pair a device and run a session (P2) — **desktop side owned; device side delegated to SDKs**

From the desktop, the tester pairs a device by presenting a QR code / short pairing code, selects a Test Plan (or ad hoc cases), a build, server, platform, and target device, starts a session, and watches live API traffic and app logs stream in.

**Independent test (desktop portion)**: Present a pairing code, accept a device connection, start a session, and confirm the live viewer renders streamed requests within a couple of seconds and shows in-progress state before responses arrive; stop the session and record a result.

Desktop-relevant scenarios: US2 #1 (device appears registered with stable ID, platform, display name), #2 (allowlist rejects unregistered devices before the viewer), #3 (session created with unique ID, shown active), #5 (live viewer shows each request without ending the session), #6 (Stop prompts for Passed/Failed/Blocked/Incomplete), #7 (trusted device reconnects), #8 (session continues when the backend connection drops). The device-side prompt (#4) and SwiftUI/UIKit parity (#9) are the SDKs' responsibility.

### US3 — Inspect captured activity grouped by user action (P3) — **desktop inspector owned**

The desktop's log inspector groups streamed API traffic and app logs under the user action that produced them, with an "Unattributed" group, empty groups for actions that produced no traffic, and a grouped/flat toggle. (User Actions themselves are detected and attributed on-device by the SDKs; the desktop renders and groups them.)

### US4 — Flag a bug during a session without stopping it (P4) — **owned**

The tester clicks "Bug Occurred"; a marker is added to the session timeline, a configurable window of surrounding activity is captured/bookmarked (API logs, app logs, preceding user actions, any attached screenshot/recording), and the session keeps running. Multiple markers can be raised in one session. Acceptance scenarios 1–4 from `the umbrella spec` US4 apply.

### US5 — Capture screenshots/recordings (P5) — **desktop as evidence sink**

Captures are taken on-device; when attached to a bug the binary travels device → desktop → backend. The desktop receives the binary, uploads it to durable backend storage as part of bug sync, and shows evidence as "pending upload" until the transfer completes.

### US7 — Review results, coverage, and history (P7) — **owned**

The QA Lead reviews session history, pass/fail by plan, failed cases by build, bugs by environment, and per-Test-Case results across the plans that include it. Acceptance scenarios 1–4 from `the umbrella spec` US7 apply.

### US8 — Bulk-import test cases from a file (P8) — **owned**

The QA Lead imports Test Cases from CSV/Excel with a preview showing row-level errors before commit; duplicate titles are allowed. Acceptance scenarios 1–3 from `the umbrella spec` US8 apply.

---

## Functional Requirements

Requirement IDs are preserved from `the umbrella spec` for traceability. Requirements marked *(shared)* are jointly owned with the backend or an SDK; the wording below states the desktop's responsibility.

### Authentication & identity (desktop side)

- **FR-001b** *(shared with backend)*: The desktop MUST initiate authentication via **Google SSO**. Email/password is out of scope.
- **FR-051a**: The desktop MUST perform sign-in in the user's **system browser** using Authorization Code with PKCE and a loopback (`127.0.0.1`) redirect. It MUST NOT use an embedded webview and MUST NOT hold a client secret.
- **FR-052a**: The desktop MUST cache the backend-minted session credential (in the OS keychain) and the user's membership list so it can operate without contacting the backend or the identity provider.
- **FR-053**: While a cached session is within its **offline grace period** (default 30 days, configurable), the desktop MUST remain fully functional with no connectivity — starting/running sessions, capturing, raising bugs, and reviewing local history all work and sync later. Connectivity is required only for initial sign-in and for renewal after grace expires.
- **FR-053a**: Grace-period expiry MUST NOT interrupt a running session or block access to already-captured local data. It MAY require re-authentication before a **new** session is started.
- **FR-054**: Signing out MUST clear the cached session credential and cached workspace data from the desktop, and MUST NOT delete data already synced to the backend.

### Workspace & active-workspace switching (desktop side)

- **FR-001** *(shared)*: The desktop MUST scope all displayed data (test cases, plans, sessions, bugs, devices, captures) to the active workspace, isolating one workspace's data from another's.
- **FR-056a**: A user MUST be able to see every workspace they belong to and switch the desktop's **active workspace**; all content shown MUST be scoped to the active workspace only.
- **FR-056c** *(shared)*: A Device registration belongs to the workspace it was paired into; switching the active workspace MUST NOT reattribute an existing device, session, bug, or capture.
- **FR-056d**: The desktop MUST prevent switching the active workspace while a test session is running, rather than silently reassigning or orphaning that session's data.

### Test Case management

- **FR-003**: Full CRUD for Test Cases, each with at least title, category/tag, platform, and server. Run-status is derived (FR-003a), not stored. No build-version field on a Test Case.
- **FR-003a**: Display a **derived summary status** per Test Case row computed across its per-plan instances with precedence `Has Fail → Blocked → In Progress → All Passed → Not Run`; computed on read, not persisted. Per-instance status (Not Run/Passed/Failed/Blocked) is visible when a row is expanded.
- **FR-003b**: Test Cases carry an independent Active/Archived lifecycle flag, separate from run-outcome status.
- **FR-003c**: A Test Case's platform MUST be one of iOS, Android, or Both.
- **FR-004**: Provide a searchable Test Case list, filterable by category, tag, status, platform, and server, and sortable by recently updated, title, status, and platform.
- **FR-005** *(shared with backend for storage)*: Preserve and display audit metadata (created by/at, updated by/at) and update it on every edit.
- **FR-006** *(shared)*: Delete a Test Case with confirmation using soft delete so historical session references remain intact and viewable.
- **FR-007** *(shared)*: Allow a Test Case in more than one Test Plan without duplicating its core content.
- **FR-008** *(shared with backend)*: Import Test Cases from CSV/Excel — validate missing required fields and invalid values, present a preview with row-level errors before commit; duplicate titles MUST NOT be blocked or flagged.

### Test Plan management

- **FR-009**: Create, update, archive, and duplicate Test Plans.
- **FR-010**: Add/remove Test Cases from a plan; support plan-level notes and a target build.
- **FR-011**: Associate a plan with its Test Cases, bugs, and sessions, plus a build version and an environment/server target.

### Manual Test Runner (desktop side)

- **FR-012**: Start a session by selecting a Test Plan or ad hoc Test Cases, a build version, a server, a platform, and a target device, producing a session with a unique ID.
- **FR-013**: Record a "Bug Occurred" marker during an active session that creates a bug record, captures/bookmarks a window of activity around that moment, and keeps the session running.
- **FR-014**: Stop a session and prompt for a result of Passed, Failed, Blocked, or Incomplete.
- **FR-015**: Identify each connected device by a stable device ID plus a user-defined display name.
- **FR-016**: Support pairing via QR code or pairing code as the default flow, without requiring manual IP entry. Manual endpoint entry MAY remain for dev/troubleshooting but MUST NOT be the default.
- **FR-017**: Support a configurable device access policy of `open` or `allowlist`, defaulting to `allowlist`.
- **FR-018**: Register a device with a display name; enable/disable a registered device without deleting its registration; disabling rejects future records without losing the registration; removing a registration requires re-registration.
- **FR-019**: Persist device registrations and their enabled/disabled state across desktop restarts.
- **FR-020**: Treat device ID / allowlist membership as a filtering control only, not authentication — trust relies on a separate, short-lived pairing token.
- **FR-020a**: A pairing token MUST be single-use and expire on first successful pairing or after a 5-minute TTL, whichever comes first. Refreshing the QR/code mints a new token and invalidates the previous one.
- **FR-021**: Support at least two concurrent, visible device sessions from one desktop instance, keeping each session's state and logs isolated by device and session ID.
- **FR-022**: Show the observed source platform for a connected device once available.

### Log inspector — grouping by user action (desktop side)

- **FR-029a**: The desktop's live log viewer, device access policy, pairing flow, and reporting views MUST behave identically regardless of whether the connected device is iOS or Android.
- **FR-039b** *(shared with SDKs)*: The desktop's log inspector MUST offer a grouped view nesting records under their originating User Action, showing each group's label, timestamp, record count, and success/error summary.
- **FR-039c** *(shared)*: Unattributable records MUST appear under a clearly labelled "Unattributed" group, never dropped or misattributed.
- **FR-039d** *(shared)*: A User Action that produced no records MUST still appear as an empty group.
- **FR-039e** *(shared)*: The user MUST be able to switch between grouped and flat chronological views without data loss, with search/sort/filter applying within grouped mode and hiding groups with no matching records.

### Bugs and evidence (desktop side)

- **FR-030** *(shared with backend)*: Record per bug: title, description, severity, status, related test case, related session, related plan, device, build version, and environment.
- **FR-030a**: Severity MUST be one of P0, P1, P2, P3.
- **FR-030b**: Status MUST be one of Open, In Progress, Resolved, Closed, Won't Fix; new bugs default to Open.
- **FR-031**: Support attaching evidence to a bug: a timeline marker, a log excerpt captured around the event, the User Actions that preceded it, and any attached screenshots/recordings.
- **FR-032**: The captured evidence window MUST be configurable, time-based (seconds before/after the bug marker), defaulting to ±30 seconds.
- **FR-044** *(shared with SDKs + backend)*: On attach, the desktop MUST receive the capture binary from the device and upload it to durable backend storage as part of that Bug's sync, so evidence is viewable by anyone with workspace access.
- **FR-044a** *(shared)*: The device's only upload target is the desktop; a capture attached while the desktop/backend is unreachable MUST be queued and retried, and the Bug MUST show its evidence as "pending upload" until transfer completes — never appearing to have no evidence.
- **FR-044b** *(shared)*: A capture's metadata MUST sync with the Bug independently of its binary, so a Bug record is never blocked from syncing by a large media file.

### Reporting and history

- **FR-033**: Provide session history, pass/fail rate by plan, failed cases by build, bugs by environment, and API error patterns by session or device.
- **FR-034**: Let a user view a Test Case's result independently for each Test Plan that includes it.

### Reliability and continuity (desktop side)

- **FR-035**: Keep a local device-to-desktop session operating and capturing data even when the backend is temporarily unreachable.
- **FR-035b** *(shared with backend)*: Bugs and their evidence MUST be persisted local-first and synced to the backend once a connection is available; clearing general logs afterward MUST NOT remove a bug's already-captured evidence.
- **FR-036** *(shared)*: Discard malformed/invalid incoming messages (recording a diagnostic) rather than surfacing them as valid data, and de-duplicate repeated deliveries of the same event so only one entry appears.

---

## Key Entities (desktop-relevant)

The desktop's local SQLite store holds the durable, local-first slice of these entities (full definitions in [data-model.md](data-model.md)):

- **Test Case**, **Tag**, **Test Plan**, **Test Plan Item** — authored content and per-plan instance status.
- **Device** — registration (ID, workspace, display name, observed platform, enabled/disabled), persisted across restarts.
- **Test Session** — one manual run (device, starter, times, build, platform, server, optional name, overall result).
- **Session Case Result** — per-Test-Case outcome within a session; authoritative source for per-plan instance status and the case-level derived summary.
- **Bug** + **Evidence** — defect record and its captured window / preceding actions / timeline marker / attached captures.
- **Auth Session** — the backend-minted credential cached locally with an issue time, expiry, and offline-grace deadline (distinct from a Test Session).
- **Workspace Membership** (cached snapshot) — drives the active-workspace switcher; the backend remains the authority.
- **Screen Capture** — the desktop stages the binary and tracks upload state (device-only / pending / stored) during bug sync.

---

## Success Criteria (desktop-relevant)

- **SC-001**: Create a Test Case and add it to a Test Plan in under 2 minutes without external docs.
- **SC-002** *(with SDKs)*: Pair a new device using only a QR scan or short pairing code — no manual network address entry in the default flow.
- **SC-003** *(with SDKs)*: An API call on the paired device appears in the desktop's live view within a couple of seconds, including "in progress" before its response arrives.
- **SC-004**: Raise multiple "Bug Occurred" markers in one session without the session stopping or losing captured data.
- **SC-005**: When the backend is unreachable, an already-running device-to-desktop session continues to capture and display data with no in-session data loss.
- **SC-006** *(with SDKs + backend)*: Sensitive fields never appear unredacted in any desktop viewer or exported evidence.
- **SC-007**: Reporting views match the underlying session/bug data with zero discrepancies when spot-checked.
- **SC-008**: An unregistered/disabled device's traffic never appears in the live viewer while the policy is `allowlist`.
- **SC-009**: Importing a mixed valid/invalid file commits only valid rows, with invalid rows clearly flagged before commit.
- **SC-013a** *(with backend)*: A bug with an attached capture can be opened by a different person on a different machine (originating device + desktop offline) and its visual evidence is viewable, once upload completed.
- **SC-018**: The desktop can be built and its tests run from a clean checkout without the other three projects present.
- **SC-019** *(with SDKs)*: A desktop build one contract-minor ahead of a device's SDK pairs and runs a full session, with any desktop-only capability shown as *unavailable-for-this-device* rather than failing or silently doing nothing.
- **SC-020** *(with peers)*: A peer one contract-major behind is refused at handshake with a message naming which side is out of date — never partially connected.
- **SC-021**: A user in three workspaces signs in once with Google and switches between all three, seeing only that workspace's content each time, with zero cross-workspace leakage.
- **SC-022**: Fully offline with a valid cached session, a user can start a session, pair a device, capture traffic, raise a bug, and stop with a result — no sign-in prompt, no degradation beyond absent backend sync.

---

## Assumptions & Constraints (desktop-relevant)

- The desktop hosts the LAN WebSocket server; the device→desktop path is backend-independent and must keep working during a backend outage.
- The desktop owns a durable local SQLite store (sessions, results, bugs, evidence, device registrations, sync outbox, media staging) and runs two outboxes: a record outbox and a **separate** media outbox (so a large video never blocks a bug record from syncing).
- Authentication must never block testing: a cached session with 30-day offline grace is the mechanism. Sign-in is the single connectivity-dependent moment in the product.
- Membership — not role — is the enforced access boundary for now (every member is `admin`); the desktop must surface a backend sync rejection (e.g. revoked membership) rather than silently dropping the queued records.
- "Server" and "environment" are interchangeable (Production, Staging, QA, Local).
- General API logs, app logs, and user actions are live working data — the desktop can clear them and they are not durably persisted to the backend; only bugs + evidence sync.
- Target platforms: macOS 12+, Windows 10+, Linux.
