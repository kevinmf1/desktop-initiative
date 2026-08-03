# Feature Specification: QA Test Management Platform (Desktop + Backend + iOS SDK + Android SDK)

**Feature Branch**: `001-test-management-platform`

**Created**: 2026-07-06

**Last Revised**: 2026-07-28

**Status**: Draft (revised v3)

**Input**: User description: Original brief described a no-database desktop QA tool (Tauri) with manual test-plan import/export and a Websocket-synced Mobile SDK for iOS and Android. A Claude Design project export (`QATools.zip`) then supplied authored requirements, architecture, connection-protocol, and roadmap documents that superseded that framing (v2). The user has now (v3) directed: split delivery into four independently-built projects (Tauri desktop, Go backend, native Swift iOS SDK, native Kotlin Android SDK); the iOS SDK must work in both SwiftUI and UIKit host apps; the SDK feature set is defined by `design/mobile-sdk-qa.html`; the API log inspector must group logs by the user action that produced them; and the SDK must capture screenshots and screen recordings both attached to a test/session and standalone.

**Design references**:

- `QATools.zip` (Claude Design project export) — authoritative for desktop/backend scope and business rules via its `uploads/` documents (`qa-tool-requirements.md`, `system-architecture.md`, `sdk-tauri-connection.md`, `implementation-roadmap.md`, `system-charts.md`). Its JSX mockups are authoritative for desktop presentation/UI-flow details only.
- `design/mobile-sdk-qa.html` — **authoritative for the mobile SDK's embedded UI and feature set** (v3). It is an interactive prototype of the SDK overlay running inside a host app.
- `design/desktop-standalone.html`, `design/mobile-sdk-figma.html` — supporting presentation references.

## Revision History

- **v1** (original prompt only): assumed no backend/database, manual Test Plan import/export as the only data-sharing mechanism, and a Mobile SDK covering both iOS and Android.
- **v2**: the uploaded requirements documents described a materially different and more detailed product:
  - A **backend platform** (persistence, auth, workspaces, sync, realtime) is in scope — "no database" no longer holds. Manual CSV/Excel *test case* import remains, but it supplements the backend rather than replacing it.
  - Mobile capture was iOS-only for the MVP in the uploaded roadmap. *(Overridden in the `/speckit-clarify` session — Android SDK support IS an MVP goal.)*
  - A **Web client** is a planned future surface, in addition to Desktop.
  - Device pairing has concrete, specified mechanics (QR code / manual pairing code, short-lived tokens, an `open`/`allowlist` device access policy).
  - The bug-capture flow is a **non-blocking "Bug Occurred" marker** raised *during* a still-running session, distinct from ending the session via "Stop" and choosing a result.
  - Diagnostic data capture was scoped to **API/network traffic** only; logcat/app-log capture was explicitly excluded.
- **v3 (this revision)**: user-directed changes on top of v2:
  - **Delivery is split into four separately-built, separately-versioned projects**: (1) Tauri desktop app, (2) backend service, (3) native Swift iOS SDK, (4) native Kotlin Android SDK. They integrate over published contracts rather than shared source.
  - The **backend technology is Go, organised as a Go workspace** (multi-module) — this replaces the Node.js/NestJS backend assumed by the v2 plan.
  - The **iOS SDK must be consumable from both SwiftUI and UIKit host apps** with equivalent capability and no host-app architecture constraint.
  - **Logcat / app-log capture is now IN scope** — v2 excluded it, but `design/mobile-sdk-qa.html` shows a first-class app-log tab with levels, tags, and detail views. This reverses the v2 exclusion.
  - **Crash capture and crash history are now IN scope** — the SDK captures an uncaught exception with its stack trace plus the surrounding network and app-log windows, and retains a browsable crash history.
  - **SDK-local session history with read-only replay** is now in scope (list, rename, delete, reopen an archived session read-only).
  - The **API log inspector groups captured activity by the user action that produced it** (e.g. "Click — Checkout", "Swipe down — Product Feed"), on both the SDK overlay and the desktop.
  - The SDK can take **screenshots**, both attached to a running test case/session and **standalone** (outside any session). **Screen recording is optional and exploratory** — scoped as spike EX-001, not an MVP commitment.
  - **Users belong to many workspaces, and authentication moves into MVP scope via Google SSO.** The v2 model scoped a User to exactly one workspace (a modelling error) and deferred all authentication to post-MVP. v3 makes User a global record reached through explicit Workspace Membership, requires Google SSO sign-in, and keeps the app fully usable offline for 30 days on a cached session so this does not violate local-first resilience. Email/password is dropped from FR-001b; roles stay deferred.
  - Where v2 and v3 conflict, v3 wins. Where the uploaded documents and `design/mobile-sdk-qa.html` conflict on SDK UI/features, the design HTML wins.

## Clarifications

### Session 2026-07-06

- Q: What authentication method should the backend use for workspace users? → A: Target design should support both email/password and SSO, but for the MVP, defer real backend authentication — the app runs with local/implicit single-user access (no enforced login flow) for now. ***SUPERSEDED 2026-07-28**: authentication is now MVP scope via Google SSO, and email/password is out of scope — see the Session 2026-07-28 entries below.*
- Q: What are the valid values for a Test Case's "status" field? → A: Status is a run-outcome enum — Not Run / Passed / Failed / Blocked — reflecting the case's current testing state. Separately, every Test Case also carries an independent Active/Archived lifecycle flag.
- Q: What are the valid severity levels for a Bug? → A: P0 / P1 / P2 / P3.
- Q: How should "platform" be modeled on a Test Case, and is build version needed at Test Case creation, and should duplicate titles be blocked? → A: A Test Case's platform is a choice of iOS, Android, or Both (not build-version-scoped). Build version is dropped from the Test Case entity entirely. Duplicate Test Case titles are acceptable for the MVP.
- Q: What role/permission boundaries should the MVP enforce among admin, lead, tester, developer, and viewer? → A: MVP only needs a single admin role; differentiated role permissions are a post-MVP decision.
- Q: Should Android SDK support be part of the MVP, or deferred as the uploaded roadmap suggested? → A: Android SDK support IS an MVP goal — both iOS and Android capture SDKs are in scope.

### Session 2026-07-10

- Q: What does a Test Case's row-level `status` represent, given results are tracked per plan? → A: The status shown on a Test Case row is a derived summary aggregated across all of that case's per-plan instances; it is computed, not stored.
- Q: What are the valid values for a Bug's status? → A: Open, In Progress, Resolved, Closed, Won't Fix (new bugs default to Open).
- Q: Where do captured session & API-log records durably live, given the backend can be unreachable mid-session? → A: General API logs are stored locally on the mobile device by the SDK and streamed to the desktop over WebSocket; they are working/live data that both sides can clear, and are not durably persisted to the backend. Bugs (with their captured evidence/log window) are the exception: local-first, synced to the backend once a connection is available.
- Q: How is a bug's captured log window measured, and what is the default? → A: Time-based — N seconds before/after the bug marker's timestamp, configurable, defaulting to ±30 seconds.
- Q: How long is the desktop's pairing code/token valid? → A: Single-use with a 5-minute TTL — it expires on the first successful pairing or after 5 minutes, whichever comes first; refreshing the QR/code mints a new one.

### Session 2026-07-28

- Q: How should the product be structured for delivery? → A: Four separate projects, each independently built, versioned, and released: Tauri desktop app, backend service, native Swift iOS SDK, native Kotlin Android SDK. Cross-project integration happens through published, versioned contracts.
- Q: What backend technology? → A: Go, organised as a Go workspace (`go.work`) with separate modules for the HTTP interface layer, core logic, and shared contracts/DTOs. This replaces Node.js.
- Q: Which iOS UI frameworks must the SDK support? → A: Both SwiftUI and UIKit host applications, with equivalent capability in each; the SDK must not force the host app to adopt one or the other.
- Q: What defines the mobile SDK's feature set? → A: `design/mobile-sdk-qa.html` is the authoritative reference for the SDK's embedded overlay and its features.
- Q: How should captured API logs be organised in the inspector? → A: Grouped by the user action that produced them (e.g. Click, Swipe down, Scroll, Long press, Text input, App launch, Background/Foreground), so a tester sees "what I did" and the network/app activity that followed it.
- Q: What visual capture must the SDK support? → A: Screenshots and screen recordings, usable both while a test case/session is running (captured as evidence linked to that test/session) and standalone with no session running.
- Q: Can a user belong to more than one workspace? → A: Yes. A User is a global record, not owned by a workspace; membership is an explicit many-to-many relationship. The previous 1:1 user→workspace model was a modelling error, not a deliberate constraint.
- Q: Should real authentication ship now, and by what method? → A: Yes — **Google SSO**, moving authentication from post-MVP into MVP scope. Email/password is **not** built; the identity model stays provider-generic so it (or any other IdP) is additive later. This amends FR-001b, which previously required both.
- Q: What happens when Google or the backend is unreachable? → A: Login is required once; the backend mints a session the desktop caches, and while cached (30-day offline grace) the app works fully offline — sessions, capture, and bug capture all run and sync later. Connectivity is needed only for initial or expired login. This is the only option compatible with Principle III and SC-005.
- Q: Do multi-workspace users need per-workspace roles? → A: Not yet. Workspace membership carries a role column and every member is `admin`; no permission differentiation is enforced. FR-002's deferral of a real role system stands.
- Q: Is screen recording an MVP commitment? → A: No. Screenshots are committed; **screen recording is optional and needs further exploration** before it is committed at all. It is scoped as spike EX-001, and FR-041/FR-045/FR-045a/FR-047a plus US5 scenarios 6–7 are conditional on that spike's outcome. Recording must not block or delay any other requirement, and if it is not delivered the SDK exposes no recording control rather than an inert one.
- Q: Where do screenshot and screen-recording binaries durably live once attached to a Bug? → A: Device → desktop on attach → desktop uploads the binary to backend object storage as part of bug sync. The backend durably stores the media, so a synced Bug carries viewable evidence for anyone with workspace access. The device never uploads to the backend directly; routing through the desktop keeps the device-side path local-first.
- Q: What minimum OS versions must the two SDKs support? → A: Track the host app's floor as low as practical — **iOS 13+ and Android 6 (API 23)+**. The SDK's minimum must never be the reason a host app cannot integrate, so it sits at or below the floor of the apps expected to adopt it. The full core capture set (API traffic, app logs, user actions, crashes, screenshots, screen recording, the overlay) MUST work at those floors; where a capability genuinely requires a newer OS, it MUST be presented as unavailable-on-this-OS with a reason, never silently absent.
- Q: What are the default limits on screen recording and the on-device capture library? → A: 5 minutes maximum per recording and a 500 MB total capture-library cap, both configurable by the host app. Hitting either limit finalises the current recording rather than discarding it.
- Q: How strict is contract-version compatibility between the four projects? → A: Semantic versioning with additive minors — peers sharing the same contract major version MUST connect; a newer minor may add fields/messages that an older peer ignores. Peers negotiate capability at handshake so each side knows what the other supports. A major-version mismatch MUST refuse the connection with a clear message. Silent degradation is not permitted.
- Q: How are user actions detected for log grouping? → A: Automatically only — the SDK derives actions by observing the host app's touch/gesture stream and lifecycle. The host app is not modified and there is NO host-facing API for declaring or labelling actions. Labels are derived from what the SDK can observe (accessibility label, view identifier, visible text, screen/context), and attribution is inherently heuristic.

## Technical Constraints *(mandated by the user — recorded here so `/speckit-plan` treats them as fixed inputs, not open choices)*

These are deliberate, user-mandated technology decisions. Everything else in this spec remains implementation-agnostic.

- **TC-001**: Delivery is **four separate projects**, each with its own build, version, and release cadence:
  1. **Desktop app** — Tauri.
  2. **Backend** — Go, structured as a **Go workspace** with distinct modules: an interface/HTTP layer, a core-logic module that exclusively owns the database pool, and a shared contracts/DTO module consumed by both. Store-layer code lives under the core module's `internal/` so it is not importable from outside that module.
  3. **iOS SDK** — native Swift.
  4. **Android SDK** — native Kotlin.
- **TC-002**: The backend persists to PostgreSQL and reads its configuration (including the database connection string) from the environment once at startup, failing fast on missing/invalid configuration rather than reading environment variables at scattered call sites.
- **TC-003**: Redaction of sensitive fields is enforced as a defensive gate at the backend boundary (rejecting records that would store unredacted secrets), in addition to redaction performed on-device by the SDK.
- **TC-004**: Sync is idempotent — re-delivering an already-accepted record is detected and de-duplicated rather than creating a second record.
- **TC-005a**: The backend provides durable object storage for bug-attached screenshot and screen-recording binaries, addressed separately from the relational record so that media transfer and record sync can succeed or fail independently.
- **TC-005**: The two SDKs are distributed as consumable library artifacts for their platforms' standard dependency managers; a host app integrates one by adding a dependency, not by vendoring source.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Organize test cases and test plans (Priority: P1)

A QA Lead maintains a catalog of Test Cases (title, category/tag, platform, server) and groups them into Test Plans that represent a release, regression pass, or testing campaign. The same Test Case can belong to multiple Test Plans. The Lead can create, view, edit, and delete both Test Cases and Test Plans, and organize plans with notes and a target build.

**Why this priority**: Nothing else in the tool works without a way to author and organize test content — every other story operates on this data.

**Independent Test**: Create several Test Cases, group a subset into two different Test Plans (with one Test Case shared by both), and confirm both plans list the correct cases with correct summary information — without needing a device, session, or SDK at all.

**Acceptance Scenarios**:

1. **Given** no existing Test Cases, **When** the QA Lead creates a new Test Case with at least a title, category/tag, platform (iOS, Android, or Both), and server, **Then** the Test Case appears in the searchable Test Case list with that information visible.
2. **Given** a populated Test Case list, **When** the QA Lead filters by category, tag, status, platform, or server, or sorts by recently updated, title, status, or platform, **Then** the list updates accordingly without altering the underlying data.
3. **Given** an existing Test Case, **When** the QA Lead edits any of its fields, **Then** the system preserves audit metadata (created by, created at, updated by, updated at) reflecting the change.
4. **Given** a Test Case in active use, **When** the QA Lead deletes it and confirms, **Then** the case is removed from active lists but its references inside historical sessions remain intact and viewable.
5. **Given** an existing Test Case, **When** the QA Lead adds it to a second Test Plan, **Then** it appears in both plans without duplicating its underlying content, and each plan can track it independently.
6. **Given** a Test Plan, **When** the QA Lead sets plan-level notes and a target build, or archives, or duplicates the plan, **Then** those changes are reflected without affecting other plans.

---

### User Story 2 - Pair a mobile device and run a manual test session (Priority: P2)

A QA Tester, from the desktop app, pairs a mobile device — iOS or Android, running a host app with the QA SDK embedded — by scanning a QR code or entering a short pairing code; no manual IP entry is required for the default flow. Once paired, the tester selects a Test Plan (or ad hoc Test Cases), a build version, server, and platform, and starts a session. The desktop shows live API traffic and app logs streamed from the device in real time while the tester performs the steps manually on the device. On the device, the SDK asks the tester to accept or decline the incoming test case before it starts, showing that case's constraints.

**Why this priority**: This is the product's core value — turning manual mobile testing into a device-in-the-loop session with live visibility — but it depends on Story 1's test content existing first.

**Independent Test**: Pair one iOS device (once with a SwiftUI host app, once with a UIKit host app) and one Android device, start a session against one Test Plan on each, make a few API calls on the device, and confirm the desktop's live viewer shows those requests in real time for every combination, and each session can be stopped with a recorded result.

**Acceptance Scenarios**:

1. **Given** a mobile device with the SDK's pairing screen open, **When** the tester scans the desktop's QR code or enters the desktop's short-lived pairing code, **Then** the device connects and appears as a registered, enabled device with a stable device ID, its observed platform, and a user-defined display name.
2. **Given** the desktop's device access policy is set to `allowlist` (the default), **When** an unregistered device attempts to send records, **Then** the desktop rejects those records and they never reach the log viewer.
3. **Given** a registered and enabled device, **When** the tester selects a Test Plan (or ad hoc cases), build version, server, platform, and target device and clicks "Run", **Then** a session is created with a unique session ID and the desktop shows it as active.
4. **Given** the desktop starts a test case against a paired device, **When** the SDK receives it, **Then** the device shows a prompt naming the test case and listing its constraints, and the tester can Accept (the session's active-test banner appears on-device) or Decline (the desktop is told the case was declined).
5. **Given** an active session with the paired device making API calls, **When** those calls occur, **Then** the desktop's live log viewer shows each request/response (or in-progress request) without requiring the session to end first.
6. **Given** an active session, **When** the tester clicks "Stop", **Then** the desktop prompts for a result (Passed, Failed, Blocked, or Incomplete) and records it against the session.
7. **Given** a previously paired, trusted device, **When** it reconnects later, **Then** it reconnects automatically without repeating the full pairing flow, subject to the device still being enabled.
8. **Given** the desktop temporarily loses its connection to the backend, **When** a session is already running locally between the device and desktop, **Then** the session continues to operate and capture data without interruption.
9. **Given** the same host application integrated once with SwiftUI and once with UIKit, **When** each is paired and run through this flow, **Then** the SDK's capability, overlay, and captured data are equivalent in both.

---

### User Story 3 - Inspect captured activity grouped by user action (Priority: P3)

A tester or developer looks at the captured API traffic and app logs and sees them grouped under the user action that produced them — "Click · Checkout button", "Swipe down · Product Feed", "App launch" — rather than as one flat, undifferentiated stream. Expanding an action group shows the requests and logs that followed it, so it is immediately clear which interaction caused which traffic. This grouping is available both in the SDK's on-device overlay and in the desktop's log inspector.

**Why this priority**: A flat log stream is the single biggest usability problem with live capture — without action grouping, a tester cannot tell which of a dozen concurrent requests belongs to the thing they just tapped. It applies to every session, so it ranks above bug capture.

**Independent Test**: Start a session, perform three distinct interactions on the device (a tap that fires one request, a pull-to-refresh that fires several, and a scroll that fires none), and confirm both the on-device overlay and the desktop show three action groups with the correct requests attributed to each, including an empty group for the scroll.

**Acceptance Scenarios**:

1. **Given** an active capture, **When** the tester performs a recognised interaction (tap/click, swipe, scroll, long press, text input, app launch, foreground/background transition), **Then** an action entry is recorded with its type, a human-readable label, a timestamp, and the screen/context it occurred on.
2. **Given** API requests and app logs occur after an action, **When** the inspector is viewed in grouped mode, **Then** those records appear nested under that action's group, and each group shows a count and its own success/error summary.
3. **Given** activity occurs that cannot be attributed to any recognised action (e.g. a background poll or a push-triggered refresh), **When** the inspector is viewed in grouped mode, **Then** that activity appears under a clearly labelled "Unattributed" group rather than being dropped or misattributed.
4. **Given** the inspector is in grouped mode, **When** the tester switches to the flat chronological view, **Then** the same records are shown as a single time-ordered list with no data loss, and switching back restores the grouping.
5. **Given** search, sort, and status filters are applied, **When** grouped mode is active, **Then** the filters apply to the records within groups and groups left with no matching records are hidden.

---

### User Story 4 - Flag a bug during a session without stopping it (Priority: P4)

While a session is running, the tester notices a defect. They click "Bug Occurred", which records a bug marker in the session timeline and captures a window of activity around that moment — API logs, app logs, the user actions leading up to it, and any screenshot or recording taken — all without stopping the still-running session. The tester can keep testing and raise additional bug markers in the same session.

**Why this priority**: This is what turns a live stream into an actionable bug record, but it only matters once a session (Story 2) is running and inspectable (Story 3).

**Independent Test**: Start a session, trigger "Bug Occurred" two or more times while continuing to interact with the device, and confirm the session keeps running throughout, with each marker capturing a distinct, correctly time-windowed slice of activity, plus at least a title, description, severity, and status recorded for each bug.

**Acceptance Scenarios**:

1. **Given** an active session, **When** the tester clicks "Bug Occurred", **Then** a bug marker is created in the session timeline, a window of activity around that timestamp is captured/bookmarked, and the session remains active and running.
2. **Given** a bug marker has just been created, **When** the tester fills in its title, description, and severity, **Then** the bug is saved with a link to the originating test case, session, plan, device, build version, and environment.
3. **Given** the tester taps "Bug Occurred" multiple times in quick succession, **When** each tap is processed, **Then** each produces its own distinct bug marker and captured window rather than corrupting session state or merging unrelated events.
4. **Given** a bug has been recorded, **When** the tester later reviews it, **Then** they can see its evidence — timeline marker, log excerpt, the user actions that preceded it, and any attached screenshot or recording — linked back to the session.

---

### User Story 5 - Capture screenshots (and, optionally, screen recordings) (Priority: P5)

A tester captures what is on screen. When a test case or session is running, the capture is automatically attached to that test case/session (and to a bug, if raised from one). When nothing is running, the same capture works standalone and is kept in the device's capture library, from where the tester can review it, share it, or attach it to a bug later.

**Screenshots are the committed MVP capability.** **Screen recording is optional and exploratory** — its scenarios are marked below and are delivered only if the EX-001 spike concludes it is viable. This story ships and is independently valuable with screenshots alone.

**Why this priority**: Visual evidence is what makes a bug report actionable to a developer, and standalone capture makes the SDK useful for ad hoc exploratory testing outside a formal session. It builds on the session and bug flows but is independently demonstrable.

**Independent Test**: With no session running, take a screenshot and confirm it lands in the capture library and can be reviewed and shared. Then start a session, repeat, and confirm the new capture is additionally linked to that session and test case and appears on the desktop alongside it. Recording, if delivered, is verified the same way.

**Acceptance Scenarios**:

1. **Given** no session is running, **When** the tester takes a screenshot from the SDK overlay, **Then** the capture is saved to the on-device capture library with its timestamp, screen/context, app build, and device, and is reviewable and shareable from the SDK.
2. **Given** a test case/session is running, **When** the tester takes a screenshot, **Then** the capture is saved with a link to that session and the active test case, in addition to appearing in the capture library.
3. **Given** a capture exists, **When** the tester raises or edits a bug, **Then** they can attach that capture to the bug as evidence, and the attachment is visible to the desktop as part of the bug's evidence.
4. **Given** the SDK overlay itself is on screen, **When** a capture is taken, **Then** the overlay's own UI is excluded so the capture shows the host app, not the QA tool.
5. **Given** the device's capture library grows, **When** the tester reviews it, **Then** they can delete individual captures, and the SDK enforces a configurable storage cap by evicting the oldest unattached captures first — never evicting a capture that is attached to a bug.
6. *(OPTIONAL — recording only, conditional on EX-001)* **Given** the tester starts a recording from the SDK overlay, **When** they stop it, **Then** the recording is finalised with its duration and is playable from the SDK; **and** if the app is backgrounded, crashes, or the recording hits its configured limit, the partial recording is still finalised and retained rather than lost.
7. *(OPTIONAL — recording only, conditional on EX-001)* **Given** a recording exists, **When** the tester attaches it to a bug, **Then** it follows the same evidence path as a screenshot (scenario 3) with no separate handling.

---

### User Story 6 - Debug on-device with the SDK overlay, with or without a desktop (Priority: P6)

A mobile developer or tester working alone opens the QA SDK overlay from a draggable floating button inside the host app. Without pairing to any desktop, they can browse live API traffic and app logs, open any entry's full detail (headers, request body, response body, timing) and copy it as a cURL command, search/sort/filter, clear a tab, review crashes the app has hit, and reopen a previous session read-only. Everything the desktop shows about a device's activity is also available on the device itself.

**Why this priority**: Standalone (unpaired) on-device debugging is what makes the SDK adoptable by developers day-to-day, independent of the desktop app's rollout — but the platform's primary value is still the paired session flow.

**Independent Test**: Integrate the SDK into a host app, never pair it with a desktop, and confirm the tester can open the overlay, see live traffic and logs, drill into an entry and copy its cURL, force a crash and find it in crash history with its surrounding logs, and reopen a prior session in read-only mode.

**Acceptance Scenarios**:

1. **Given** the SDK is integrated with its overlay enabled, **When** the host app runs, **Then** a floating action button is visible, can be dragged anywhere, snaps to the nearest screen edge, and fades to a low-prominence idle state when untouched so it does not obstruct the host app.
2. **Given** the overlay is open and unpaired, **When** the host app makes API calls and writes app logs, **Then** both appear live in their respective tabs with a summary of total/success/error counts, and the connection row clearly shows the disconnected state with a one-tap path to pair.
3. **Given** a captured API entry, **When** the tester opens it, **Then** they see method, URL, status, timing, size, request headers/body and response headers/body in separate tabs, can search within a body with match navigation, can copy any section, and can copy or share the request as a cURL command.
4. **Given** a captured app-log entry, **When** the tester opens it, **Then** they see its level, tag, timestamp, and full message, with long messages readable rather than truncated.
5. **Given** the host app hits an uncaught exception, **When** the SDK detects it, **Then** it records a crash with the exception message and stack trace plus the API and app-log activity around it, presents it to the tester, and retains it in a browsable crash history that survives app restart.
6. **Given** previous sessions exist on the device, **When** the tester opens session history, **Then** they can rename a session, delete a session, and reopen one in a clearly-marked read-only archive mode where captured data is viewable but not modifiable, with an explicit way to exit back to the live session.
7. **Given** the tester wants to reduce noise, **When** they use search, the sort order control, the endpoint/tag filters, or the status filter, **Then** the visible list updates accordingly; **and** when they clear a tab, they are asked to confirm first and only that tab's records are cleared.
8. **Given** the host app or the tester prefers a different appearance, **When** the tester toggles the overlay theme, **Then** the overlay switches between light and dark presentation without affecting the host app.
9. **Given** a host app that does not want any built-in UI, **When** it initialises the SDK in headless mode, **Then** capture and streaming work fully with no overlay or floating button presented.

---

### User Story 7 - Review results, coverage, and history (Priority: P7)

A QA Lead reviews session history, pass/fail rates by plan, failed cases by build, and bugs by environment to understand overall coverage and quality trends, including per-Test-Case results across the plans that include it.

**Why this priority**: Valuable for oversight and process improvement, but it is a read-only view over data produced by earlier stories, so it has no standalone value until those exist.

**Independent Test**: Run several sessions against one or more Test Plans with a mix of Passed/Failed/Blocked/Incomplete results and a few bug markers, then confirm the reporting views' pass/fail-by-plan, failed-cases-by-build, and bugs-by-environment figures match the underlying session data.

**Acceptance Scenarios**:

1. **Given** a Test Plan with a known set of completed sessions, **When** the QA Lead opens its reporting view, **Then** the displayed pass/fail rate matches the actual outcomes recorded for that plan.
2. **Given** a Test Case included in multiple Test Plans, **When** the QA Lead inspects that case, **Then** they can see its result independently per plan (not one merged status).
3. **Given** bugs recorded across multiple environments (e.g. Production, Staging, QA, Local), **When** the QA Lead opens the bugs-by-environment view, **Then** the counts reflect the actual environment recorded on each bug.
4. **Given** two devices running sessions concurrently, **When** the QA Lead reviews history, **Then** logs and results remain correctly isolated and attributable to the device and session that produced them.

---

### User Story 8 - Bulk-import test cases from a file (Priority: P8)

A QA Lead imports a batch of Test Cases from a structured file (CSV or Excel) instead of creating them one by one, reviewing a preview with row-level errors before committing the import.

**Why this priority**: Useful for onboarding an existing test suite, but the tool is fully usable without it, and the source material treats bulk import as a later-phase enhancement.

**Independent Test**: Import a file containing a mix of valid rows and rows with missing required fields, and confirm the preview correctly flags the invalid rows while allowing the valid rows (including any sharing a title with an existing Test Case) to be committed.

**Acceptance Scenarios**:

1. **Given** a well-formed CSV or Excel file of Test Cases, **When** the QA Lead imports it, **Then** a preview shows the rows to be created before anything is committed.
2. **Given** an import file with a row missing a required field or containing an invalid field value, **When** the preview is generated, **Then** that row is flagged with a specific, row-level error and is not silently imported.
3. **Given** an import file containing a row whose title matches an existing Test Case's title, **When** the preview is generated, **Then** the row is imported as a separate Test Case like any other row — duplicate titles are acceptable.

---

### Edge Cases

- What happens when an unregistered device (in `allowlist` mode) or a disabled device sends records? They must be rejected before reaching the log viewer, without deleting an existing disabled device's registration.
- What happens when a device is removed (not just disabled)? Future records from that device ID must be rejected until it is registered again from scratch.
- What happens if two different devices present the same device ID? A device ID is a filtering/routing identifier, not proof of identity — a separate short-lived pairing token/credential is required to establish trust.
- What happens if a malformed or invalid message arrives over the local connection? It must be discarded/rejected with a recorded diagnostic, not shown to the user as valid data.
- What happens if the same event/record is received more than once (e.g. due to a reconnect retry)? Exactly one entry must be kept per unique event.
- What happens if the device disconnects mid-session? The desktop must detect the disconnect, allow reconnect, and must not corrupt or silently discard already-captured session data.
- What happens if "Bug Occurred" is tapped repeatedly in fast succession? Session continuity must be preserved — no crash, no session termination, no merged/corrupted bug markers.
- What happens if live traffic volume is very high during a session? The log viewer must remain responsive (e.g. via truncation/virtualization) rather than freezing.
- What happens to sensitive data (auth headers, cookies, tokens, passwords, API keys) in captured requests/responses? It must be redacted before it is shown, stored, or transmitted anywhere — and the backend must additionally reject records that arrive unredacted.
- What happens when the backend is temporarily unreachable but a local device-to-desktop session is underway? The local session must keep working; only backend-dependent features may be degraded.
- What happens when a Test Case referenced by a historical session is later deleted? The historical session and its recorded result must remain viewable and intact.
- **What happens when the host app makes requests before the SDK finishes initialising?** Those requests are either captured or explicitly reported as "capture started after app launch" — they must not be silently attributed to the wrong user action.
- **What happens when several actions occur faster than the traffic they trigger returns?** Each request must be attributed to the action that initiated it, not simply to the most recent action at response time.
- **What happens when a user action produces no traffic at all?** Its group is still shown (empty), so the tester can see the interaction was recorded.
- **What happens when the host app is backgrounded or killed during a screen recording?** The partial recording must be finalised and retained, not lost or left corrupt.
- **What happens when screen recording is attempted while the OS denies the required permission, or the OS blocks capture of protected content?** The SDK must surface a clear, actionable message and leave the session otherwise unaffected — never crash the host app.
- **What happens when the capture library exceeds its storage cap?** Oldest unattached captures are evicted first; captures attached to a bug are never evicted automatically.
- **What happens when a capture is attached to a bug while the desktop or backend is unreachable?** The binary is queued on the device and retried; the Bug syncs on its own with the capture shown as "pending upload", and never appears to have no evidence at all.
- **What happens if the device→desktop or desktop→backend media transfer is interrupted part-way?** The transfer resumes or restarts without producing a truncated file that presents as a complete one, and the capture stays in "pending" state until the stored copy is verifiably complete.
- **What happens to a capture's device-local copy once it is durably stored in the backend?** It remains on the device and stays subject to the storage cap's eviction rules, except that a bug-attached capture is never auto-evicted — evicting it locally after successful upload is permitted only if the durable copy is confirmed.
- **What happens when the SDK overlay is on screen at the moment of capture?** The overlay must be excluded from the resulting image/video.
- **What happens when a crash occurs while a session is active?** The crash record and its surrounding activity window must be retained across the app restart and be associable with the session that was running.
- **What happens when the SDK runs on a host app at the minimum supported OS (iOS 13 / Android 6) rather than a current release?** The full core capture set still works; anything that provably cannot is shown as unavailable-on-this-OS with the version required, never silently missing.
- **What happens when a host app's own minimum OS is lower than the SDK's?** That host app cannot integrate — so the SDK's floor is set at or below the expected host floor, and raising it later is a breaking major-version change, not a routine upgrade.
- **What happens when a host app integrates the iOS SDK from UIKit rather than SwiftUI (or mixes both)?** The overlay must present and behave identically; the SDK must not require the host to adopt a particular UI framework or app lifecycle.
- **What happens when the user is offline at first launch, before ever signing in?** There is no cached session, so sign-in cannot complete and no workspace can be opened. This is the one connectivity-dependent moment in the product and must be stated plainly to the user, not presented as a generic failure.
- **What happens when the offline grace period expires mid-session?** The running session continues to completion and its data is retained; only starting a *new* session requires re-authentication (FR-053a).
- **What happens when a user's membership is revoked while their desktop is offline?** The cached session keeps working until grace expires — revocation is not instantaneous. The backend rejects that workspace's syncs the moment connectivity returns, and the desktop must surface the rejection rather than silently discarding the queued records.
- **What happens when a user changes their Google email address?** They remain the same User, because identity is keyed on the provider's stable subject, not the email (FR-051).
- **What happens when two Google accounts share one person, or one account is used by two people?** Each Google subject is one User. The system does not attempt to merge or split identities.
- **What happens when a user tries to switch the active workspace while a session is running?** The switch is refused with a clear reason (FR-056d) — silently reassigning the session would corrupt attribution of its logs, bugs and results.
- **What happens to a device paired into workspace A when the user switches to workspace B?** It stays registered to A and does not appear in B (FR-056c).
- **What happens when a user belongs to zero workspaces?** Sign-in succeeds but there is nothing to open; the user is shown an explicit empty state rather than an error or an implicitly-created workspace.
- **What happens when one project (desktop, backend, or an SDK) is upgraded ahead of the others?** If they share a contract major version, they connect and operate; the newer peer's added fields are ignored by the older one, and any feature the older peer cannot support is shown as unavailable-because-out-of-date. If the majors differ, the connection is refused with a message naming which peer to upgrade.
- **What happens when an older SDK receives a message type introduced after its release?** It ignores it without erroring and without dropping the rest of the stream.
- **What happens when the desktop offers a capability (e.g. action grouping or screen recording) that the paired device's older SDK lacks?** The desktop presents that capability as unavailable for that device and says why, rather than hiding it or appearing to work and returning nothing.

## Requirements *(mandatory)*

### Functional Requirements

**Delivery structure**

- **FR-000**: The product MUST be delivered as four independently buildable, independently versioned projects — desktop app, backend service, iOS SDK, Android SDK — such that any one can be built, tested, and released without building the others.
- **FR-000a**: Cross-project integration MUST occur through explicitly published, semantically-versioned contracts (the device↔desktop protocol, the desktop↔backend sync API, and each SDK's public API), not through shared source code or implicit coupling. Each contract is versioned independently of the projects that implement it.
- **FR-000b**: Each SDK MUST be consumable by a host application as a standard dependency for its platform, requiring no source vendoring and no modification of the host app's build system beyond adding the dependency and initialising the SDK.
- **FR-000c**: Each shared contract MUST carry a semantic version. Two peers sharing the same contract **major** version MUST be able to connect and operate; a **major**-version mismatch MUST refuse the connection and report clearly to the user which peer is out of date and what to upgrade, rather than proceeding with partially-interpreted data.
- **FR-000d**: Within a major version, minor revisions MUST be **additive only** — new fields and new message types may be introduced, but existing fields MUST NOT change meaning, type, or be removed. A peer MUST ignore fields and message types it does not recognise rather than treating them as errors.
- **FR-000e**: Peers MUST exchange their contract version and supported capabilities during connection handshake, and each side MUST expose what the other supports so that a feature unavailable on an older peer is presented to the user as unavailable-because-out-of-date — never silently absent and never silently degraded.

**Workspace, roles, and access**

- **FR-001**: System MUST organize all data (test cases, plans, sessions, bugs, devices, captures) within a workspace, isolating one workspace's data from another's.
- **FR-001a**: A User MUST be able to belong to **more than one workspace**. A User is a global record and MUST NOT be owned by, or scoped to, a single workspace; membership MUST be modelled as an explicit many-to-many relationship carrying its own attributes.
- **FR-001b**: The system MUST authenticate workspace users via **Google SSO**. Email/password login is explicitly **not** in scope; the identity model MUST remain provider-generic so email/password or another identity provider can be added later without a schema rewrite. *(Amends the previous FR-001b, which required both methods.)*
- **FR-002**: Every workspace membership MUST carry a role attribute, and for now every member MUST be `admin` — no permission differentiation is enforced. A real role system (lead, tester, developer, viewer) remains deferred to a post-MVP decision.

**Authentication & identity** *(new — moves auth from post-MVP into MVP)*

- **FR-051**: The system MUST authenticate a user by verifying a Google-issued identity assertion, and MUST establish identity from the provider's **stable subject identifier**, never from the email address. A user changing their Google email MUST remain the same User.
- **FR-051a**: The desktop MUST perform sign-in in the user's **system browser** using Authorization Code with PKCE and a loopback redirect. It MUST NOT present the provider's sign-in page in an embedded webview, and MUST NOT hold a client secret.
- **FR-051b**: The backend MUST independently verify the identity assertion — signature against the provider's published keys, issuer, audience, expiry, and the nonce bound to the originating request — before establishing any session. It MUST NOT trust an assertion merely because it arrived from the desktop.
- **FR-052**: On successful verification the backend MUST mint **its own session credential** and return it with the user's workspace memberships. Provider tokens MUST NOT be used as the system's session credential and MUST NOT be forwarded to any other component.
- **FR-052a**: The desktop MUST cache the session credential and the user's membership list so it can operate without contacting the backend or the identity provider.
- **FR-053**: While a cached session is within its **offline grace period** (default 30 days, configurable), the desktop MUST remain fully functional with no connectivity: starting and running sessions, capturing, raising bugs, and reviewing local history MUST all work, syncing later. Connectivity MUST be required only for initial sign-in and for renewal after grace expires.
- **FR-053a**: Expiry of the offline grace period MUST NOT interrupt a running session, and MUST NOT block access to data already captured locally. It MAY require re-authentication before a **new** session is started.
- **FR-054**: Signing out MUST clear the cached session credential and cached workspace data from the desktop, and MUST NOT delete data already synced to the backend.
- **FR-055**: The mobile SDKs MUST remain unauthenticated. A device pairs to a desktop with a pairing token (FR-016/020) and MUST NOT hold, request, or transmit user credentials or identity.

**Workspace membership**

- **FR-056**: The system MUST record workspace membership explicitly, with at least the user, the workspace, a role, a membership status, and when it was established.
- **FR-056a**: A user MUST be able to see every workspace they belong to and switch the desktop's **active workspace**. All test content, sessions, devices, bugs and reporting shown MUST be scoped to the active workspace only (FR-001).
- **FR-056b**: A user MUST NOT be able to read or write any workspace they are not an active member of. The backend MUST enforce this server-side on every request, independently of what the desktop requests.
- **FR-056c**: A Device registration belongs to the workspace it was paired into. Switching the active workspace MUST NOT reattribute an existing device, session, bug, or captured record to a different workspace.
- **FR-056d**: The system MUST prevent switching the active workspace while a test session is running, rather than silently reassigning or orphaning that session's data.

**Test Case management**

- **FR-003**: System MUST support full CRUD for Test Cases, each with at least a title, category/tag, platform, and server. A Test Case's run-status is derived (per FR-003a), not stored. Test Cases do NOT carry a build version field.
- **FR-003a**: Run outcome MUST be tracked per Test-Case-in-a-Test-Plan instance: each instance's status MUST be one of Not Run, Passed, Failed, Blocked, updated as sessions record results, and visible when a Test Case row is expanded. The Test Case row MUST display a **derived summary status** computed across all of that case's plan instances with the precedence: `Has Fail` (≥1 Failed) → `Blocked` (≥1 Blocked, none Failed) → `In Progress` (mix of Passed and Not Run, none Failed/Blocked) → `All Passed` → `Not Run`. This summary is computed on read, not persisted.
- **FR-003b**: A Test Case MUST additionally carry an independent lifecycle flag of Active or Archived, separate from its run-outcome status.
- **FR-003c**: A Test Case's platform MUST be one of: iOS, Android, or Both.
- **FR-004**: System MUST provide a searchable Test Case list, filterable by category, tag, status, platform, and server, and sortable by recently updated, title, status, and platform.
- **FR-005**: System MUST preserve audit metadata on every Test Case (created by, created at, updated by, updated at) and update it on every edit.
- **FR-006**: System MUST support deleting a Test Case with confirmation, using soft delete so historical session references remain intact and viewable.
- **FR-007**: System MUST allow a Test Case to be included in more than one Test Plan without duplicating its core content.
- **FR-008**: System MUST support importing Test Cases from CSV or Excel, validating for missing required fields and invalid values, and presenting a preview with row-level errors before committing. Duplicate titles MUST NOT be blocked or flagged.

**Test Plan management**

- **FR-009**: System MUST support create, update, archive, and duplicate operations on Test Plans.
- **FR-010**: System MUST allow adding and removing Test Cases from a Test Plan, and support plan-level notes and a target build.
- **FR-011**: System MUST allow a Test Plan to be associated with the Test Cases, bugs, and sessions that reference it, plus a build version and an environment/server target.

**Manual Test Runner**

- **FR-012**: System MUST let a user start a session by selecting a Test Plan or ad hoc Test Cases, a build version, a server, a platform, and a target device, producing a session with a unique ID.
- **FR-012a**: When the desktop starts a Test Case against a paired device, the SDK MUST present the tester with the test case's name and its constraints and MUST require an explicit Accept or Decline; a Decline MUST be reported back to the desktop and MUST NOT start capture against that case.
- **FR-012b**: While a Test Case is running, the SDK MUST display a persistent, collapsible on-device banner naming the active test case and, when expanded, its constraints.
- **FR-013**: System MUST let the user record a "Bug Occurred" marker during an active session that creates a bug record, captures/bookmarks a window of activity around that moment, and keeps the session running.
- **FR-014**: System MUST let the user stop a session and MUST prompt for a result of Passed, Failed, Blocked, or Incomplete.
- **FR-015**: System MUST identify each connected device by a stable device ID plus a user-defined display name.
- **FR-016**: System MUST support pairing via QR code or pairing code as the default flow, without requiring manual IP entry. A manual endpoint entry MAY remain available for development/troubleshooting but MUST NOT be the default presented flow.
- **FR-016a**: The SDK's pairing screen MUST offer camera-based QR scanning with a torch/flashlight toggle, MUST give clear success feedback on a successful scan, and MUST offer manual endpoint entry as a secondary option on the same screen.
- **FR-017**: System MUST support a configurable device access policy of `open` or `allowlist`, with `allowlist` as the default.
- **FR-018**: System MUST let the user register a device with a display name, and enable or disable a registered device without deleting its registration; disabling MUST reject future records without losing the registration, and removing a registration MUST require re-registration.
- **FR-019**: System MUST persist device registrations and their enabled/disabled state across desktop restarts.
- **FR-020**: System MUST treat device ID/allowlist membership as a filtering control only, not as authentication — trust MUST rely on a separate, short-lived pairing token.
- **FR-020a**: A pairing token MUST be single-use and MUST expire on first successful pairing or after a 5-minute TTL, whichever comes first. Refreshing the QR/pairing code MUST mint a new token and invalidate the previous one.
- **FR-021**: System MUST support at least two concurrent, visible device sessions from one desktop instance, keeping each session's state and logs isolated by device and session ID.
- **FR-022**: System MUST show the observed source platform for a connected device once available.

**Mobile capture SDK — API traffic**

- **FR-023**: The mobile SDK (iOS and Android) MUST capture, per API request made by the host app: request URL, HTTP method, headers, a request body preview, response status code, response headers, a response body preview, timestamps, duration, response size, and any network or decoding error. Capture behaviour MUST be equivalent across both platforms.
- **FR-024**: The mobile SDK MUST redact sensitive header and body fields (at minimum Authorization, Cookie, token, password, apiKey) before the data is stored or transmitted anywhere, on both platforms.
- **FR-025**: The mobile SDK MUST stream captured events to the paired desktop in real time, including in-progress request state, so the desktop can show a request before its response arrives.
- **FR-026**: The mobile SDK MUST buffer a short rolling backlog of events during brief disconnects and reconnect to a previously trusted desktop automatically where possible.
- **FR-029**: The mobile SDK MUST NOT block the host application's main thread while capturing.
- **FR-029a**: The desktop's live log viewer, device access policy, pairing flow, and reporting views MUST behave identically regardless of whether the connected device is iOS or Android.

**Mobile capture SDK — app logs and crashes** *(new in v3; reverses the v2 exclusion)*

- **FR-037**: The mobile SDK MUST capture the host app's log output as App Log Events, each with a timestamp, severity level (at minimum verbose, debug, info, warn, error), a tag/source, and the full message, and MUST make them available in a dedicated inspector tab separate from API traffic.
- **FR-037a**: App Log Events MUST be searchable and filterable by level and tag, and MUST be openable in a detail view showing the complete message without truncation.
- **FR-037b**: The mobile SDK MUST redact sensitive values in app log messages using the same rules as API capture (FR-024) before storing or transmitting them.
- **FR-038**: The mobile SDK MUST detect an uncaught exception in the host app and record a Crash Report containing the exception type/message, its stack trace, the timestamp, the app build, and the API and app-log activity captured within a window around the crash.
- **FR-038a**: Crash Reports MUST survive the host app's restart and MUST be browsable as a crash history, from which the tester can open any past crash and inspect both its stack trace and its captured API and app-log windows.
- **FR-038b**: Crash detection and recording MUST NOT prevent the host app's own crash handling from running, and MUST NOT itself crash the host app.

**Log inspector — grouping by user action** *(new in v3)*

- **FR-039**: The mobile SDK MUST record User Action events for the tester's interactions with the host app, each with an action type, a human-readable label, a timestamp, and the screen/context in which it occurred. Recognised action types MUST include at minimum: click/tap, swipe (with direction), scroll, long press, text input, app launch, and foreground/background transition.
- **FR-039h**: User Actions MUST be detected **automatically**, by observing the host application's touch/gesture stream and lifecycle. Detection MUST require no change to the host application beyond adding and initialising the SDK, and MUST work on a host app whose source is unavailable or unmodifiable.
- **FR-039i**: A User Action's human-readable label MUST be derived from information the SDK can observe about the interaction target — in order of preference: its accessibility label, its visible text, its view/component identifier, then a positional fallback — combined with the current screen/context. Where no better information is observable, a generic but unambiguous label MUST be produced rather than an empty one.
- **FR-039a**: Captured API Log Events and App Log Events MUST be attributed to the User Action that initiated them, based on the initiating action at the time the record was started (not the most recent action at the time it completed).
- **FR-039b**: Both the SDK's inspector and the desktop's log inspector MUST offer a grouped view in which records are nested under their originating User Action, showing each group's action label, timestamp, record count, and success/error summary.
- **FR-039c**: Records that cannot be attributed to any recognised User Action MUST be presented under a clearly labelled "Unattributed" group and MUST NOT be dropped or attributed to an unrelated action.
- **FR-039d**: A User Action that produced no records MUST still appear as an (empty) group so the tester can see the interaction was recorded.
- **FR-039e**: The tester MUST be able to switch between the grouped view and a flat chronological view without losing any records, and search/sort/filter MUST apply within grouped mode, hiding groups left with no matching records.
- **FR-039f**: The SDK MUST NOT expose a host-facing API for declaring or labelling User Actions. Action capture is entirely SDK-derived (FR-039h/FR-039i); host apps neither can nor need to instrument their interactions.
- **FR-039g**: User Action capture MUST NOT record the content of text entered into fields marked as secure/password entry, and MUST record only that a text-input action occurred.

**Screenshots (committed) and screen recording (optional, gated on EX-001)** *(new in v3)*

- **FR-040**: The mobile SDK MUST let the tester capture a screenshot of the host app from the SDK overlay, both while a session/test case is running and standalone with no session running.
- **FR-041** *(OPTIONAL — EXPLORATORY, not MVP-committed)*: The mobile SDK SHOULD let the tester start and stop a screen recording of the host app from the SDK overlay, both while a session/test case is running and standalone. Screen recording is **not** required for the MVP to be complete and MUST NOT block delivery of any other requirement. It is committed only after the feasibility spike in EX-001 concludes; until then, every recording-specific requirement below (FR-045, FR-045a, FR-047a) is conditional on that outcome. Screenshots (FR-040) are **not** conditional — they remain a hard MVP requirement, and every capture-related requirement that is not recording-specific (FR-042, FR-043, FR-044, FR-046, FR-047, FR-048) applies to screenshots regardless of whether recording ships.
- **FR-042**: Every capture (screenshot or recording) MUST record at least: its type, timestamp, duration (for recordings), the screen/context, the app build, and the device; and, when taken during a session, the session ID and the active test case.
- **FR-043**: Captures taken with no session running MUST be retained in an on-device capture library where the tester can review, share, delete, and later attach them to a bug.
- **FR-044**: The tester MUST be able to attach any capture to a Bug as evidence. On attach, the capture's binary MUST be transferred from the device to the paired desktop, and the desktop MUST upload it to durable backend storage as part of that Bug's sync, so the evidence is viewable by anyone with workspace access and not only from the device or desktop that produced it.
- **FR-044a**: A capture's binary MUST NOT be uploaded from the device to the backend directly — the device's only upload target is the paired desktop. A capture attached while the desktop, the backend, or both are unreachable MUST be queued and retried, and the Bug MUST show its evidence as "pending upload" until the transfer completes rather than appearing to have no evidence.
- **FR-044b**: A capture's metadata (type, timestamp, duration, screen/context, build, device) MUST sync with the Bug independently of its binary, so a Bug record is never blocked from syncing by a large or still-transferring media file.
- **FR-045** *(conditional on FR-041)*: A screen recording that is interrupted (app backgrounded, host app crash, or configured duration/size limit reached) MUST be finalised and retained as a playable partial recording rather than lost or left unplayable.
- **FR-045a** *(conditional on FR-041)*: A single screen recording MUST be limited to a maximum duration, defaulting to **5 minutes** and configurable by the host app. On reaching the limit the SDK MUST finalise and retain the recording and MUST tell the tester it stopped because the limit was reached.
- **FR-046**: The SDK's own overlay UI MUST be excluded from screenshots and screen recordings.
- **FR-047**: The SDK MUST enforce a total on-device storage cap for the capture library, defaulting to **500 MB** and configurable by the host app, evicting the oldest **unattached** captures first and never automatically evicting a capture attached to a Bug. When capture is blocked by a missing OS permission or protected on-screen content, the SDK MUST surface a clear, actionable message and MUST NOT crash or disrupt the host app.
- **FR-047a** *(conditional on FR-041)*: When the storage cap cannot be honoured without evicting bug-attached captures, the SDK MUST refuse to start a new recording and tell the tester the library is full and what to delete, rather than evicting protected evidence or failing silently mid-recording.
- **FR-048**: Recordings and screenshots MUST NOT leave the device automatically; transfer MUST occur only as part of an explicit user action (attaching to a Bug, or sharing/exporting). An unattached capture MUST remain device-local indefinitely.

**Mobile SDK — embedded overlay UI**

- **FR-027**: The mobile SDK MUST support an embedded debug overlay as well as a headless mode with no built-in UI, selectable by the host app.
- **FR-027a**: The overlay MUST be reachable from a floating action button that the tester can drag anywhere on screen, that snaps to the nearest screen edge, and that fades to a low-prominence idle state when untouched so it does not obstruct the host app.
- **FR-027b**: The overlay MUST present, at minimum: connection status with a one-tap path to pair or disconnect, the current session identity with the ability to rename it, separate tabs for API traffic and app logs, a running total/success/error summary for captured traffic, search, a sort-order control, endpoint/tag and status filters, and a per-tab clear action that requires explicit confirmation.
- **FR-027c**: The overlay MUST provide a full-screen detail view for a captured API record showing method, URL, status, timing and size, plus request headers, request body, response headers, and response body in separate sections; the tester MUST be able to search within a body with match navigation, copy any section, and copy or share the record as an equivalent cURL command.
- **FR-027d**: The overlay MUST provide an on-device session history from which the tester can select, rename, and delete past sessions, and reopen a past session in a clearly-indicated read-only archive mode with an explicit action to return to the live session.
- **FR-027e**: The overlay MUST support both light and dark presentation, switchable by the tester, without affecting the host application's own appearance.
- **FR-027f**: The overlay MUST be presentable as a partial-height sheet that the tester can expand to full screen and dismiss by gesture or by an explicit close control.
- **FR-028**: The SDK's embedded UI MUST expose a copyable device ID for use in manual allowlist registration on the desktop.

**iOS SDK host compatibility** *(new in v3)*

- **FR-049**: The iOS SDK MUST be usable from host applications built with SwiftUI, with UIKit, or with a mix of both, providing equivalent capability in each; it MUST NOT require the host app to adopt a particular UI framework, app lifecycle, or architecture.
- **FR-049a**: The iOS SDK MUST expose an integration surface appropriate to each host style — one that works from a UIKit view controller/window hierarchy and one that works from a SwiftUI scene/view hierarchy — while the overlay's presentation, capture behaviour, and captured data remain identical.
- **FR-049b**: The iOS SDK's overlay MUST render above the host app's content in both host styles without the host app having to relayout, wrap its root view, or subclass SDK-provided types.

**SDK platform support floor** *(new in v3)*

- **FR-050**: The iOS SDK MUST support host applications targeting **iOS 13 or later**, and the Android SDK MUST support host applications targeting **Android 6.0 (API 23) or later**. The SDK's own minimum MUST NOT exceed the host application's minimum — an SDK version requirement MUST never be the reason a host app cannot integrate.
- **FR-050a**: The full core capture set — API traffic capture, app-log capture, user-action detection, crash capture, screenshots, screen recording, and the embedded overlay — MUST function at those minimum OS versions, not only on current OS releases.
- **FR-050b**: Where a capability genuinely cannot be provided on an older supported OS, the SDK MUST present it to the tester as unavailable-on-this-OS with the reason and the version required, consistent with FR-000e's prohibition on silent degradation. It MUST NOT be hidden, and it MUST NOT appear functional while doing nothing.
- **FR-050c**: Raising either SDK's minimum OS version MUST be treated as a breaking change to that SDK's public contract (a major-version bump per FR-000c), because it can render an existing host app unable to upgrade.

**Bugs and evidence**

- **FR-030**: System MUST record, per bug: title, description, severity, status, related test case, related session, related plan, device, build version, and environment.
- **FR-030a**: A Bug's severity MUST be one of: P0, P1, P2, P3.
- **FR-030b**: A Bug's status MUST be one of: Open, In Progress, Resolved, Closed, Won't Fix. New bugs default to Open.
- **FR-031**: System MUST support attaching evidence to a bug: a timeline marker, a log excerpt captured around the event, the User Actions that preceded it, and any attached screenshots or screen recordings.
- **FR-032**: The captured evidence window MUST be configurable rather than fixed. It is time-based — a number of seconds of activity before and after the bug marker's timestamp — and MUST default to ±30 seconds.

**Reporting and history**

- **FR-033**: System MUST provide session history, pass/fail rate by plan, failed cases by build, bugs by environment, and API error patterns by session or device.
- **FR-034**: System MUST let a user view a Test Case's result independently for each Test Plan that includes it.

**Reliability and continuity**

- **FR-035**: System MUST keep a local device-to-desktop session operating and capturing data even when the backend is temporarily unreachable.
- **FR-035a**: The mobile SDK MUST store captured API logs, app logs, and user actions locally on the device and stream them to the paired desktop. These are live working data: both the SDK and the desktop MUST be able to clear them, and they are NOT required to be durably persisted to the backend.
- **FR-035b**: Bugs, and the evidence captured with them (bookmarked activity window, timeline marker, attached captures), MUST be persisted local-first and synced to the backend once a connection is available. Because bug evidence is captured at bug-creation time, clearing the general logs afterward MUST NOT remove a bug's already-captured evidence.
- **FR-035c**: Crash Reports and the on-device capture library MUST survive host app restarts independently of the general log buffers.
- **FR-036**: System MUST discard malformed/invalid incoming messages (recording a diagnostic) rather than surfacing them as valid data, and MUST de-duplicate repeated deliveries of the same event so only one entry appears.
- **FR-036a**: The backend MUST reject a record that would persist unredacted sensitive fields, as a defensive gate independent of the SDK's own redaction, and MUST report the rejection distinguishably from other failures.

### Key Entities

- **Workspace**: Top-level tenant/organization boundary; owns test cases, tags, plans, sessions, bugs, devices, and captures. It does **not** own users — it has members.
- **User**: A person, global to the installation and **not scoped to any workspace**. Carries display name, email, and sign-in history. Reaches workspaces only through Workspace Membership.
- **Workspace Membership**: The many-to-many link between a User and a Workspace — role (currently always `admin`), status, who invited them, and when they joined. This is the sole authority on what a user may access; a user with no active membership for a workspace can neither read nor write it.
- **Identity**: A verified external sign-in linked to a User — provider (`google`), the provider's **stable subject identifier**, email, and verification state. Keyed on the subject identifier rather than email, so a user changing their Google email remains the same User. Provider-generic so additional providers are additive.
- **Auth Session**: A backend-minted session credential representing a signed-in User, with an issue time, an expiry, and an offline grace deadline. Cached by the desktop so the app functions without connectivity. Distinct from a Test Session, which is a test run — the two share no relationship.
- **Test Case**: Canonical, reusable test content — title, description, an Active/Archived lifecycle flag, platform (iOS/Android/Both), server, tags — independent of any one Test Plan. Its run-status is a **derived summary** computed from its per-plan instance results, not stored.
- **Tag**: A label applied to Test Cases for categorization/filtering.
- **Test Plan**: A named collection of Test Cases representing a release, regression pass, or campaign; carries notes and a target build; can be archived or duplicated.
- **Test Plan Item**: The membership link between a Test Plan and a Test Case; carries that case's per-plan instance status (Not Run/Passed/Failed/Blocked).
- **Device**: A registered mobile device — ID, workspace, user-defined display name, observed platform, enabled/disabled state — distinct from any single connection/session.
- **Test Session**: One manual test run — workspace, device, who started it, start/stop time, build version, platform, server, an optional user-assigned name, and an overall result once stopped.
- **Session Case Result**: The per-Test-Case outcome (Not Run/Passed/Failed/Blocked) recorded within a session; the authoritative source for per-plan instance status and the case-level derived summary.
- **User Action**: A recorded tester interaction with the host app — action type (click/tap, swipe with direction, scroll, long press, text input, app launch, foreground/background), a human-readable label derived automatically by the SDK from the interaction target's accessibility label / visible text / view identifier / position, a timestamp, and the screen/context. It is the grouping key for API Log Events and App Log Events.
- **API Log Event**: A single captured request-lifecycle event (started, body captured, response received, failed, completed) tied to a session, device, originating User Action, and a shared request ID, with redacted request/response summaries. Stored locally by the SDK and streamed to the desktop; live working data, not durably persisted to the backend.
- **App Log Event**: A single captured host-app log line — timestamp, level, tag/source, message (redacted) — tied to a session, device, and originating User Action. Same durability treatment as API Log Event.
- **Crash Report**: A recorded uncaught exception — type/message, stack trace, timestamp, app build, device — together with the API Log Events and App Log Events captured in a window around it. Persisted on-device across app restarts and browsable as crash history.
- **Screen Capture**: A screenshot or screen recording taken on the device — type, timestamp, duration (recordings), screen/context, app build, device, an optional link to the session and active Test Case, a flag for whether it is attached to a Bug, and an upload state (device-only / pending / stored). Retained in an on-device capture library subject to a configurable storage cap. Once attached to a Bug, its binary travels device → desktop → backend object storage and becomes durable; its metadata syncs independently of the binary.
- **Bug**: A defect record — title, description, severity (P0/P1/P2/P3), status (Open/In Progress/Resolved/Closed/Won't Fix, default Open) — linked to the session, test case, plan, device, build version, and environment it was raised from, plus attached evidence.
- **Evidence**: Supporting material for a bug — a log excerpt/bundle, the preceding User Actions, a timeline marker, and any attached Screen Captures — captured around the bug's timestamp within a configurable time window (default ±30 seconds).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A QA Lead can create a Test Case and add it to a Test Plan in under 2 minutes without external documentation.
- **SC-002**: A tester can pair a new mobile device — iOS or Android — and see it appear as connected using only a QR scan or a short pairing code; no manual network address entry is required in the default flow.
- **SC-003**: Once a session is active, an API call made on the paired device appears in the desktop's live log view within a couple of seconds, including showing it as "in progress" before its response arrives.
- **SC-004**: A tester can raise multiple "Bug Occurred" markers within a single session without the session ever stopping or losing previously captured data.
- **SC-005**: When the backend is unreachable, an already-running device-to-desktop session continues to capture and display data with no loss of in-session data.
- **SC-006**: Sensitive fields (authorization headers, cookies, tokens, passwords, API keys) never appear unredacted in any viewer, in storage, in app-log capture, or in exported evidence, verified across a sample of captured requests and log lines containing such fields.
- **SC-007**: Reporting views (pass/fail rate by plan, failed cases by build, bugs by environment) match the underlying session and bug data with zero discrepancies when spot-checked.
- **SC-008**: An unregistered or disabled device's traffic never appears in the desktop's live log viewer while the access policy is `allowlist`.
- **SC-009**: Importing a file with a mix of valid and invalid Test Case rows results in only the valid rows being committed, with invalid rows clearly flagged before commit.
- **SC-010**: In a scripted run of 20 distinct interactions producing a known set of requests, at least 95% of captured records are attributed to the correct originating user action, and no record is silently dropped — anything unattributable appears under "Unattributed".
- **SC-011**: Given a session's captured data, a tester can identify which interaction caused a given failed request in under 15 seconds using the grouped inspector, without reading raw timestamps.
- **SC-012**: A tester can take a screenshot with no session running, and find it in the capture library afterwards, in under 10 seconds and without pairing to a desktop.
- **SC-013** *(conditional on EX-001; not an MVP gate)*: A screen recording interrupted by backgrounding the app or by a host-app crash is still playable afterwards, in 100% of trials.
- **SC-013a**: A bug raised with an attached capture can be opened by a different person, on a different machine, with the originating device and desktop both offline, and its visual evidence is viewable — in 100% of trials once the upload has completed.
- **SC-014**: A developer can integrate the SDK into an existing host app — SwiftUI, UIKit, or Android — and see live captured traffic in the overlay within 15 minutes, using only the SDK's published integration guide.
- **SC-015**: The same host application integrated once with SwiftUI and once with UIKit produces identical overlay capability and identical captured record structure, verified by comparing captured output for the same scripted interaction sequence.
- **SC-016**: A crash triggered in the host app is recoverable from crash history after an app restart, with its stack trace and surrounding activity window intact, in 100% of trials.
- **SC-017**: With the SDK active and capturing during a scripted interaction run, the host app shows no user-perceptible degradation — no dropped frames attributable to the SDK on the main thread and no increase in interaction latency a tester can notice.
- **SC-018**: Each of the four projects can be built and its tests run from a clean checkout without the other three present.
- **SC-021**: A user belonging to three workspaces can sign in once with Google and switch between all three, seeing only that workspace's test content, devices, sessions and bugs each time — with zero cross-workspace leakage when spot-checked.
- **SC-022**: With the machine fully disconnected from the network, a user with a valid cached session can start a session, pair a device, capture traffic, raise a bug, and stop the session with a result — in 100% of trials, with no sign-in prompt and no functional degradation beyond the absence of backend sync.
- **SC-023**: A request for a workspace the signed-in user is not an active member of is refused by the backend in 100% of trials, including when the desktop explicitly asks for it — verified by calling the API directly, not only through the UI.
- **SC-024**: A user who changes their Google email address signs in afterwards as the same User, retaining all workspace memberships.
- **SC-018a**: The full core capture set works on a device at each SDK's minimum supported OS (iOS 13, Android 6), verified by running the same scripted interaction sequence there and on a current OS release and comparing captured output.
- **SC-019**: A desktop build one contract-minor ahead of a device's SDK build pairs and runs a full session successfully, with any desktop-only capability shown as unavailable-for-this-device rather than failing or silently doing nothing.
- **SC-020**: A peer one contract-major behind is refused at handshake with a message that names which side is out of date, in 100% of trials — never partially connected.

## Assumptions

- **Delivery is four separate projects** (desktop, backend, iOS SDK, Android SDK). They share no source; they share semantically-versioned contracts. Each project owns its own repository layout, build, and release cadence, and may release independently so long as it stays within the current contract major version. Breaking a contract is a major bump and is expected to be rare and coordinated.
- The **backend is Go using a Go workspace**, replacing the Node.js/NestJS backend assumed by the previous plan. `plan.md`, `research.md`, `data-model.md`, `quickstart.md`, and all three contracts were regenerated against this v3 spec on 2026-07-28 and are current.
- The MVP mobile capture surface covers **both iOS and Android**; this overrides the uploaded roadmap document's iOS-only MVP.
- The **iOS SDK supports SwiftUI and UIKit hosts equally**; neither is a second-class integration path.
- **The SDKs deliberately support old OS floors — iOS 13 and Android 6 (API 23)** — chosen so the SDK never blocks a host app from adopting it. The cost is accepted: more per-platform fallback work and a wider device test matrix than a modern-only floor would need. iOS 13 is also the floor at which SwiftUI exists at all, which is consistent with FR-049's dual-host requirement.
- **`design/mobile-sdk-qa.html` is the authoritative feature reference for the mobile SDK.** Features present there that the v2 uploaded documents excluded (notably app-log/logcat capture, crash capture and crash history, on-device session history and read-only replay, cURL export) are **in scope** for v3.
- A **Web client** is a planned future surface, out of scope for this feature.
- Data persistence and cross-device history rely on the backend with a shared workspace-scoped store. **Real authentication is now MVP scope** via Google SSO — this reverses the earlier "MVP runs with local/implicit single-user access, no enforced login" assumption.
- **Authentication must never be able to block testing.** A cached session with a 30-day offline grace is what keeps FR-053 and Principle III compatible: sign-in is the only connectivity-dependent moment in the product. If auth were checked per-launch, a lab without internet could not test at all — which is why enforced-login-every-launch was rejected.
- **Email/password is deliberately not built.** The Identity model is provider-generic and keyed on the provider's stable subject, so adding email/password or an enterprise IdP later is additive, not a rewrite. This is a scope reduction against the original FR-001b, taken knowingly.
- **Membership, not role, is the access boundary for now.** Every member is `admin`, so the only enforced question is "are you an active member of this workspace?" — enforced server-side (FR-056b). A role system remains deferred; the role column exists so adding one is a data change rather than a schema change.
- The mobile SDKs remain entirely outside the auth story — they pair to a desktop, never to the backend, and hold no user identity (FR-055).
- Local device-to-desktop live streaming works directly over a local connection independent of the backend.
- A device ID and its allowlist status are filtering/routing controls, not authentication.
- "Bug Occurred" is a lightweight in-session marker distinct from ending the session.
- Bulk CSV/Excel import is a supplementary convenience feature, not required for the MVP core loop.
- **User actions are detected automatically by the SDK only**, by observing the host app's touch/gesture stream and lifecycle. There is deliberately no host-facing instrumentation API. The consequence is accepted: labels are only as good as what the SDK can observe (accessibility labels, visible text, view identifiers), so host apps with poor accessibility labelling will get less readable action names, and SC-010's 95% attribution target is the realistic ceiling rather than a floor to improve on. The upside is that grouping works on any host app the moment the SDK is added, including apps whose source cannot be changed.
- **Screen recording is optional and unproven** — it is gated behind the EX-001 spike and is not an MVP commitment. Screenshots carry the visual-evidence requirement on their own. If EX-001 fails, recording is dropped and nothing else in the spec changes.
- **If recording ships**, it defaults to a 5-minute maximum per clip and the capture library to a 500 MB cap, both configurable by the host app. Captures are never uploaded automatically; one leaves the device only when the tester attaches it to a Bug or shares it. The 5-minute ceiling is sized for a single bug's repro — not a whole exploratory session — to keep the device → desktop → backend transfer (FR-044) fast enough to be a routine action.
- Screenshot and recording capture uses each platform's standard on-device capture facilities; capture of OS-protected content (DRM, secure text entry, some system surfaces) may be blocked by the platform and is treated as an expected, gracefully-handled condition rather than a defect.
- "Server" and "environment" are used interchangeably to describe the target backend/environment a test run is against (e.g. Production, Staging, QA, Local).
- Role differentiation is a post-MVP decision; every workspace member is `admin`, so membership — not role — is the only access boundary enforced today.
- A Test Case's platform (iOS/Android/Both) describes intended test coverage; a case marked "Both" can be fully exercised with live SDK data on either platform.

## Exploration Required

Work that is deliberately **not committed** until a time-boxed spike answers whether it is viable. A spike's outcome is recorded here and the conditional requirements are then either promoted to MUST or removed from scope.

### EX-001: Screen recording feasibility *(gates FR-041, FR-045, FR-045a, FR-047a, US5 scenarios 6–7)*

**Status**: Open — not started. **Screen recording is OPTIONAL for the MVP** and must not block or delay any other requirement. Screenshots (FR-040) are unaffected and remain committed.

**Why it needs exploring**: recording is the highest-uncertainty item in the SDK and the only capture feature whose cost is mostly unknown. Open unknowns:

- **Platform capture APIs at the supported OS floors** (iOS 13, Android 6 per FR-050) — what is actually available, and how much per-platform divergence that forces, given Principle II requires iOS/Android parity.
- **Permission model** — recording typically requires an explicit, per-session OS permission prompt with a visible system indicator. Whether that is acceptable inside a host app's normal QA flow, and what it does to the tester's experience, is unresolved.
- **Excluding the SDK overlay from the video** (FR-046) — straightforward for a screenshot, materially harder for a live video stream.
- **Protected content** — DRM and secure text entry are blacked out or block capture entirely on both platforms; how often that makes a recording useless in practice is unknown.
- **File size and the transfer path** — a 5-minute clip is large, and FR-044 routes every attached binary device → desktop → backend. Whether that stays a routine action or becomes a multi-minute wait is untested.
- **Host-app impact** — whether recording can run without violating FR-029 (no main-thread blocking) and SC-017 (no perceptible degradation).

**Exit criteria**: a prototype on both platforms at the minimum supported OS that demonstrates (or fails to demonstrate) overlay exclusion, acceptable permission UX, and an end-to-end attach-to-bug transfer within a tolerable time — plus a sized estimate. On success, promote the conditional requirements to MUST and add matching success criteria. On failure, delete them and record the decision here.

**Interim behaviour if recording is not delivered**: the SDK exposes no recording control at all. It MUST NOT ship a visible-but-inert control, per FR-050b's prohibition on capabilities that appear functional while doing nothing.

## Open Questions

None outstanding. All four decisions raised during the v3 revision were resolved in the `/speckit-clarify` session of 2026-07-28 and integrated into the requirements above. The one remaining uncertainty is scoped as exploration (EX-001) rather than an open question, because it is answered by building a prototype, not by a decision.
