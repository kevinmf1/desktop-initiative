# QA Tool Requirements

## Purpose

Build a QA tool for mobile app testing that combines:

- Test case management
- Test plan organization
- Manual test execution
- Live device log capture through an iOS SDK
- Real-time desktop visibility for QA engineers
- Future browser visibility through backend ingestion and realtime delivery

Related product and engineering diagrams are collected in
[QA Tool System Charts](./system-charts.md).

The product should support:

- Desktop clients built with Tauri for macOS and Windows
- A backend for collaboration, persistence, sync, and remote access
- An iOS-native SDK embedded into host apps for network log capture and runner connectivity

## Product Goals

- Let QA teams define and manage test cases and test plans in one place
- Let testers run manual sessions from desktop while keeping device execution simple
- Stream iOS API request and response logs to the paired desktop in real time
- Link sessions, bugs, and captured logs to the test run timeline
- Support future expansion to web access without changing the core domain model

## Non-Goals For MVP

- Android SDK support
- Automated test execution orchestration
- Full bug tracker replacement
- Video recording as a required capability
- Enterprise-grade offline-first multi-user conflict resolution

## Primary Personas

### QA Tester

- Browses assigned plans
- Starts and runs manual tests
- Marks pass or fail
- Flags bugs during execution
- Wants immediate API visibility from the connected iOS device

### QA Lead

- Creates and organizes test cases and plans
- Tracks execution coverage and results across builds and environments
- Reviews repeated failures and flaky cases

### Developer

- Integrates the iOS SDK into the host app
- Uses the embedded debug UI to pair the app with desktop
- Reviews request and response payloads for debugging

## Platforms

### Desktop

- Tauri-based desktop app
- Primary platforms: macOS and Windows
- Primary responsibilities:
  - Test management UI
  - Manual runner control UI
  - Device connection and pairing
  - Live log viewer
  - Session review

### Mobile

- iOS native host app integration through SDK
- Primary responsibilities:
  - Record request and response data
  - Provide embedded pairing UI
  - Stream live logs to desktop
  - Support local event buffering during brief disconnects

### Web

- Future or parallel browser-based management UI
- Primary responsibilities:
  - Test case management
  - Reporting
  - Session and bug review
  - Team collaboration

### Backend

- Shared persistence and sync layer
- Authentication, authorization, and workspace isolation
- Session, run, test case, and bug storage
- Live event ingestion for web visibility and historical replay

## Functional Requirements

## 1. Test Case Management

The system must support full CRUD for test cases.

### 1.1 Test Case List

- View test cases in a searchable list
- Filter by:
  - category
  - tag
  - status
  - build version
  - platform
  - server
- Sort by recently updated, title, status, and platform
- View summary details without opening each test case

### 1.2 Create Test Case

The system must allow creation of a new test case with at least:

- Title
- Category or tag
- Status
- Build version
- Platform
- Server

Recommended future fields:

- Description
- Preconditions
- Steps
- Expected result
- Priority
- Owner
- Attachments

### 1.3 Update Test Case

- Edit any test case fields
- Preserve audit metadata:
  - created by
  - created at
  - updated by
  - updated at

### 1.4 Delete Test Case

- Allow delete with confirmation
- Prefer soft delete in backend
- Preserve references in historical sessions

### 1.5 Import Test Cases

- Support importing test cases from structured files such as CSV or Excel
- Validate duplicates, missing required fields, and invalid field values
- Show import preview and row-level errors

## 2. Test Plan Management

Test plans organize test cases by category, scope, release, or campaign.

Examples:

- Regression: Test A, Test B, Test C
- Sticky DAB: Test B, Test C

### 2.1 Plan Features

- Create, update, archive, and duplicate plans
- Add and remove test cases from plans
- Support one test case appearing in multiple plans
- Support plan-level notes and target build metadata

### 2.2 Plan Associations

A test plan must be able to associate:

- Test cases
- Bugs
- Test sessions
- Build version
- Environment or server target

## 3. Manual Test Runner

The manual runner is a core workflow that combines execution tracking and live logging.

### 3.1 Start Session

- Desktop user selects:
  - plan or ad hoc test cases
  - build version
  - server
  - platform
  - target device
- Clicking `Run` starts a test session
- Session receives a unique ID

### 3.2 Bug Occurred

- During a running session, clicking `Bug Occurred` must:
  - create a bug marker in the session timeline
  - cut or bookmark logs around the event
  - optionally trigger screenshot capture metadata if available
  - keep the session running

The action must not stop the test session.

### 3.3 Stop Session

- Clicking `Stop` ends the session
- The system prompts for result:
  - Passed
  - Failed
  - Blocked
  - Incomplete

### 3.4 Connectivity

- A desktop runner must identify a mobile device by:
  - stable device ID
  - user-defined device name
- The default connection flow must use:
  - pairing code
  - QR code
- Manual WebSocket URL entry may remain available for development and
  troubleshooting, but it is not the default target MVP flow.
- The desktop must support a configurable device access policy:
  - `open`: accept records from any reachable SDK client
  - `allowlist`: accept records only from registered and enabled device IDs
- Allowlist mode should be the default.
- A registered device must have a user-defined display name.
- A registered device can be enabled or disabled without being removed.
- Device registrations and enabled state must persist across desktop restarts.
- Removing a device must prevent future records until it is registered again.
- The UI must show the observed source platform when available.

A device ID is a routing and filtering identifier. It must not be treated as
authentication; trusted pairing requires a separate token or credential.

### 3.5 Multi-Device

- The system should support multiple concurrent runners
- Initial requirement: at least two active device runners visible from one desktop
- Session state and logs must remain isolated by device and session ID

## 4. iOS SDK

The SDK is embedded in the host iOS app and acts as the device-side capture and connection layer.

### 4.1 Capture

The SDK must capture:

- request URL
- HTTP method
- headers
- request body preview
- response status code
- response headers
- response body preview
- timestamps
- duration
- network or decoding errors

### 4.2 Embedded Debug UI

The SDK should support an optional embedded UI inside the host app:

- floating button or trigger
- pairing screen
- connection status
- recent log summary
- quick actions:
  - connect to desktop
  - reconnect
  - pause capture
  - export recent logs

Recommended behavior:

- floating button is the default SDK-provided entry point
- host apps may replace it with a custom entry point
- SDK should support showing or hiding the overlay by gesture or configuration
- SDK UI should default to debug or internal builds unless explicitly enabled elsewhere

The SDK must also support headless mode for teams that do not want built-in UI.

### 4.3 Pairing

The SDK must support pairing through:

- QR code scan
- manual code entry

After initial pairing, reconnection should be automatic when possible.

Pairing requirements:

- desktop generates short-lived pairing tokens
- tokens should expire within a short window such as 1 to 5 minutes
- SDK should remember trusted desktops after successful pairing
- SDK should support re-pairing if desktop identity changes
- pairing should not require manual IP input in the default flow

### 4.4 Desktop Streaming

- The SDK streams logs to the connected desktop in real time
- The SDK should buffer a short rolling backlog during temporary disconnections
- Sensitive values must be redacted before transmission
- Every record must contain a stable device ID and source platform.
- The SDK overlay should expose a copyable device ID for manual allowlist setup.
- The SDK must show connection state and connection errors.

Transport requirements:

- primary local transport should be WebSocket
- messages should be JSON-based and versioned
- SDK should support heartbeat and reconnect behavior
- desktop should receive events incrementally during request lifecycle, not only after completion
- the desktop must validate access policy before forwarding records to the UI

The current concept sends one completed `ApiRecord` per request or error.
Incremental lifecycle events are required for the target MVP.

Suggested live event types:

- request started
- request body captured
- response received
- request failed
- request completed
- bug marker

## 4.5 Desktop And Future Web Connectivity

The product must support a phased connectivity model:

- direct iOS-to-desktop live streaming for low-latency local debugging
- backend sync for shared history and browser access

If the viewer experience later moves to a hosted web app, the system should support:

- backend log ingestion API
- browser realtime updates through backend transport
- replay of historical session logs

## 5. Bugs And Evidence

The system must support bug capture during or after a run.

### 5.1 Bug Data

Recommended minimum fields:

- Title
- Description
- Severity
- Status
- Related test case
- Related session
- Related plan
- Device
- Build version
- Environment

### 5.2 Evidence

The system should support attaching:

- timeline markers
- log excerpts
- screenshots
- request and response bundles

Recommended bug evidence behavior:

- `Bug Occurred` should cut a log window around the event timestamp
- the captured window should include a configurable amount of pre- and post-event logs
- the resulting bundle should be linkable to both the bug and the session timeline

## 6. Reporting And History

The system should provide:

- session history
- pass or fail rate by plan
- failed cases by build
- bugs by environment
- API error patterns by session or device

## Non-Functional Requirements

## Performance

- Desktop live log rendering should remain responsive with high event volume
- SDK capture must not block the host app main thread
- Backend ingestion should support bursty session traffic

## Security

- Redact sensitive headers and body fields
- Encrypt data in transit
- Authenticate desktop and web users
- Isolate data by workspace or team

## Reliability

- Support reconnect for intermittent desktop-device network issues
- Prevent data corruption if desktop disconnects mid-session
- Preserve session continuity when `Bug Occurred` is tapped repeatedly
- Preserve live session operation even if backend is temporarily unavailable

## Auditability

- Keep mutation history for test cases and plans
- Record who started, updated, and stopped sessions

## MVP Scope Recommendation

Ship the first version with:

- Test case CRUD
- Test plan CRUD
- Manual test runner for iOS
- One or two simultaneous device sessions
- iOS SDK with embedded pairing UI
- Live desktop log stream
- Bug markers with log cut points
- Backend persistence for cases, plans, sessions, and bugs

Defer until later:

- Android SDK
- rich analytics
- full screenshot or media workflows
- advanced assignment and notifications
