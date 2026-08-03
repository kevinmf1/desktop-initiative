# QA Tool System Architecture

## Overview

The system has four main parts:

1. Desktop client built with Tauri for macOS and Windows
2. iOS-native SDK embedded in the host app
3. Backend platform for persistence, sync, auth, and remote visibility
4. Web client for future browser-based management and review

The architecture should support two operating modes:

- Local live mode: device streams logs directly to the paired desktop
- Cloud sync mode: desktop and web clients read historical and shared data from backend services

This split keeps live debugging fast while still enabling cross-device history and collaboration.

The architecture should also support a product evolution path:

- initial primary viewer: desktop app
- future secondary or primary viewer: hosted web app backed by server-side ingestion and realtime delivery

## High-Level Architecture

```text
+--------------------+       local websocket        +----------------------+
| iOS Host App       | ---------------------------> | Desktop App (Tauri)  |
| with QA SDK        |                              | macOS / Windows      |
+--------------------+                              +----------------------+
          |                                                    |
          | optional sync                                       | HTTPS / WebSocket
          v                                                    v
                 +------------------------------------------------------+
                 | Backend API + Realtime + Storage                     |
                 | auth, test cases, plans, sessions, bugs, evidence    |
                 +------------------------------------------------------+
                                       |
                                       v
                              +------------------+
                              | Web Client       |
                              | browser UI       |
                              +------------------+
```

## Core Design Principles

- Keep the iOS SDK lightweight and safe for host app integration
- Separate live transport concerns from product domain data
- Use a shared backend domain model across desktop and web
- Make pairing explicit with QR or code, then auto-reconnect afterward
- Preserve useful local behavior even if backend is unavailable
- Treat device allowlisting as a configurable filtering policy, not as proof of
  device identity

The detailed local connection contract is defined in
[SDK To Tauri Connection](./sdk-tauri-connection.md).

The canonical visual overview is available in
[QA Tool System Charts](./system-charts.md).

## Desktop Architecture

## Responsibilities

- Authenticate user to backend
- Manage workspaces, test cases, plans, sessions, and bugs
- Pair to one or more mobile devices
- Receive live SDK events from paired devices
- Display a runner UI and log inspector
- Persist session actions locally when needed

## Recommended Stack

- Tauri shell
- Frontend: React or similar component-based web UI
- Local persistence: SQLite through Tauri plugin or Rust layer
- Realtime local device receiver: Rust sidecar or Tauri Rust backend
- Backend API client: HTTPS and WebSocket or SSE

## Desktop Modules

### 1. Presentation Layer

- Test case screens
- Test plan screens
- Manual runner screens
- Live log viewer
- Pairing screen
- Session review screens

### 2. Application Layer

- Runner orchestration
- Device pairing flow
- Session lifecycle control
- Bug marker workflow
- Sync coordination

### 3. Local Transport Layer

- WebSocket server for device connections
- Pairing token validation
- Connection health monitoring
- Event ingestion and framing
- Trusted desktop identity management
- Configurable device access policy:
  - open mode for isolated development
  - allowlist mode as the recommended default
- Persistent device names and enabled or disabled state

### 4. Local Data Layer

- Cached test cases and plans
- Active session state
- Recent live logs
- Temporary offline queue

## Desktop Pairing Flow

1. Desktop user opens pairing screen
2. Desktop generates a short-lived pairing token
3. Desktop starts or exposes local WebSocket listener
4. Desktop shows QR code and manual code
5. iOS SDK scans or enters code
6. iOS SDK connects to desktop local endpoint
7. SDK sends auth payload with token and device identity
8. Desktop validates token and binds device to session context
9. Future reconnects use remembered trusted device identity plus fresh session auth

### Pairing Payload

The QR code should encode a compact payload that includes:

- connection scheme
- host or resolvable endpoint
- port
- optional path
- pairing token
- expiry timestamp
- desktop display name

Example conceptual payload:

```json
{
  "version": 1,
  "scheme": "ws",
  "host": "192.168.1.10",
  "port": 54545,
  "path": "/debug",
  "token": "abc123xyz",
  "expiresAt": "2026-06-04T10:30:00Z",
  "desktopName": "QA Lead Desktop"
}
```

## Desktop Multi-Device Strategy

- Each device connection gets its own `device_connection_id`
- Each runner gets its own `session_id`
- UI supports at least two visible live runners
- Logs, bug markers, and status changes are partitioned by session
- Device ID, display name, platform, and enabled state are stored separately
  from an active connection
- Disabling an allowlisted device rejects new records without deleting its
  registration

## iOS SDK Architecture

## Responsibilities

- Capture API traffic
- Expose optional embedded debug UI
- Pair with desktop through QR or manual code
- Stream live events
- Buffer short-lived disconnect gaps
- Protect sensitive data through redaction

## Recommended SDK Packaging

- Swift Package
- Optional UI module separated from core capture module
- Public host-app configuration API

Suggested package split:

- `QACore`
- `QANetworkCapture`
- `QALogStore`
- `QAPairing`
- `QALiveTransport`
- `QAOverlayUI`

## iOS Capture Strategy

Recommended approach:

- Prefer SDK-managed networking wrapper where feasible
- Support `URLProtocol` interception only when needed and carefully scoped
- Normalize all captured events into a shared event schema before storage or transport

## iOS Embedded UI

Recommended UX:

- Optional floating button
- Optional hidden gesture trigger
- Pairing screen with QR scanner and code entry
- Connection status badge
- Small recent logs list for local verification
- quick actions for reconnect, pause capture, and export

The SDK should be configurable so host apps can choose:

- built-in floating UI
- custom trigger
- no UI

The floating button should be treated as the default developer-facing entry point, not as a hard requirement for all host apps.

## iOS Event Pipeline

The target MVP event pipeline is:

1. Request starts
2. SDK creates `request_id`
3. Request metadata captured
4. Response or error captured
5. Event normalized
6. Sensitive fields redacted
7. Event written to rolling local store
8. Event pushed over live WebSocket if desktop is connected

Recommended event granularity:

- send request lifecycle events incrementally
- avoid waiting until the full request-response cycle completes
- allow desktop timeline to show in-progress requests immediately

The current concept sends one completed `ApiRecord` per request or request
error. Incremental lifecycle events are a target MVP change, not current
concept behavior.

## iOS Reconnect Model

- Maintain one active desktop connection per device session
- Queue recent events in memory and optionally local storage
- Retry with exponential backoff
- Drop oldest buffered events after configured retention threshold

## Backend Architecture

## Responsibilities

- User and workspace authentication
- Authorization by workspace and role
- CRUD for test cases and plans
- Session and bug persistence
- Evidence metadata storage
- Realtime updates for desktop and web
- Search and reporting

## Recommended Backend Services

### 1. API Gateway

- Exposes REST or GraphQL endpoints
- Handles auth and workspace scoping

### 2. Domain Services

- Test Case Service
- Test Plan Service
- Session Service
- Bug Service
- Evidence Service

These may begin as a modular monolith and split later only if needed.

### 3. Realtime Service

- WebSocket or SSE for browser and desktop updates
- Publishes session state, bug markers, and assignment changes
- supports future hosted web log streaming after backend ingestion

### 4. Storage

- Primary relational database such as PostgreSQL
- Object storage for screenshots and attachments
- Cache or message broker only if traffic patterns justify it

## Recommended Data Stores

- PostgreSQL:
  - users
  - workspaces
  - test_cases
  - tags
  - test_plans
  - plan_test_cases
  - sessions
  - session_case_results
  - bugs
  - evidence
  - devices
  - build_versions

- Object storage:
  - screenshots
  - imported files
  - exported evidence bundles

## Shared Domain Model

## Main Entities

### TestCase

- id
- title
- description
- status
- platform
- server
- build_version_id
- workspace_id

### Tag

- id
- name
- workspace_id

### TestCaseTag

- test_case_id
- tag_id

### TestPlan

- id
- name
- description
- workspace_id

### TestPlanItem

- plan_id
- test_case_id

### TestSession

- id
- workspace_id
- started_by
- started_at
- stopped_at
- result
- build_version_id
- platform
- server
- device_id

### SessionCaseResult

- id
- session_id
- test_case_id
- status
- notes

### Bug

- id
- workspace_id
- session_id
- test_case_id
- title
- description
- severity
- status

### ApiLogEvent

- id
- session_id
- request_id
- device_id
- timestamp
- event_type
- request_summary
- response_summary
- error_summary

## Transport Design

## Device To Desktop

Recommended:

- WebSocket over local network
- Pairing by QR or manual code
- JSON message frames

Rationale:

- supports full-duplex messaging
- fits incremental request lifecycle events
- keeps the transport easy to inspect and debug
- works well with a future browser-oriented architecture

Example message types:

- `auth`
- `auth_ok`
- `request_started`
- `request_body_captured`
- `response_received`
- `request_failed`
- `request_completed`
- `bug_marker`
- `heartbeat`

## Desktop To Backend

- HTTPS for CRUD and sync
- WebSocket or SSE for live workspace updates
- backend should not be required for local device-to-desktop live debugging in MVP

## Web To Backend

- HTTPS for CRUD
- WebSocket or SSE for dashboards and session updates

## Hosted Web Viewer Mode

If the product later shifts the main viewer from desktop to web, a backend ingestion path becomes required.

Recommended flow:

1. iOS SDK sends logs either to desktop locally or to backend ingestion endpoints
2. Backend stores normalized log events by workspace, device, and session
3. Browser clients subscribe to session streams through backend realtime channels
4. Historical sessions are queried from persistent storage

This allows the product to support both:

- local low-latency desktop inspection
- team-visible web dashboards and historical review

## Security Design

## Authentication

- Backend users authenticate with standard app auth
- Device-to-desktop connection uses short-lived pairing tokens
- Trusted device registrations should be revocable

## Authorization

- Workspace-level authorization
- Roles such as admin, lead, tester, developer, viewer

## Data Protection

- Redact common secrets:
  - Authorization
  - Cookie
  - token
  - password
  - apiKey
- Truncate large bodies
- Encrypt traffic to backend
- Prefer secure local transport in later phases

## Observability

The system should log:

- pairing attempts
- connection failures
- session lifecycle transitions
- import job results
- bug marker creation
- desktop-device disconnects

## Suggested Repository Structure

```text
/apps
  /desktop-tauri
  /web
  /backend
/packages
  /domain
  /api-client
  /ui
  /event-schema
/sdk
  /ios
/docs
  /architecture
```

## Architecture Decisions

### Decision 1: Tauri For Desktop

- Supports macOS and Windows from one product surface
- Lets the team reuse web UI patterns
- Still allows a Rust-native local transport layer

### Decision 2: iOS Native SDK

- Best choice for deep host-app integration
- Needed for request interception and embedded overlay UI

### Decision 3: Backend As Shared Source Of Truth

- Needed for collaboration, history, test management, and web access
- Desktop should not be the long-term system of record

### Decision 4: Direct Device-To-Desktop Local Stream

- Keeps live debugging low-latency
- Avoids routing every request log through backend just for local inspection

### Decision 5: WebSocket As Primary Local Transport

- Fits the pairing and live streaming workflow discussed for desktop connectivity
- Easier to evolve into browser-compatible realtime semantics later
- Supports desktop commands such as heartbeat, reconnect hints, and runner coordination

## MVP Architecture Recommendation

For MVP, build:

1. Backend modular monolith with PostgreSQL
2. Tauri desktop app with:
   - test management
   - runner UI
   - local WebSocket receiver
   - live log viewer
3. iOS SDK with:
   - API capture
   - floating pairing entry
   - QR or code-based connection
   - live streaming

Defer until later:

- browser-first live runner
- advanced analytics
- Android SDK
- media-heavy evidence workflows
