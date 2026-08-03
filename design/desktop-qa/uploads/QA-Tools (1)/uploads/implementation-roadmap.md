# QA Tool Implementation Roadmap

This roadmap describes the target product. Features already demonstrated in
`concept/` still require production hardening when they appear in Phase 1.

## Phase 0: Foundation

- Finalize domain language:
  - test case
  - test plan
  - session
  - bug
  - evidence
  - device
- Define shared event schema for live API log capture
- Version the schema and replace the concept's completed-record-only transport
  with request lifecycle events
- Decide backend API style:
  - REST
  - GraphQL

## Phase 1: MVP Core

### Backend

- User auth
- Workspace model
- Test case CRUD
- Test plan CRUD
- Session CRUD
- Bug marker creation
- PostgreSQL schema

### Desktop

- Login
- Test case list and editor
- Test plan list and editor
- Basic runner UI
- Pairing screen with QR and manual code
- Local WebSocket listener
- Device access policy setting with open and allowlist modes
- Persistent device registration, naming, enable, disable, and removal
- Live request and response viewer
- Two-pane runner plus log inspector experience

### iOS SDK

- SDK initialization API
- Request and response capture
- Redaction rules
- Pairing flow
- Floating debug button
- Persistent device ID and copy action
- Overlay-managed WebSocket connection and status
- Live stream to desktop
- Auto reconnect to previously trusted desktop

## Phase 2: Session Depth

- Multi-device support
- Session timeline
- Bug log cut and bookmark flow
- Per-case result tracking inside a session
- Desktop reconnect and event replay window

## Phase 3: Collaboration And Web

- Web management UI
- Shared dashboards
- Session history and search
- Evidence attachments
- Team roles and permissions
- Backend log ingestion for hosted web viewer mode
- Browser realtime session stream

## Phase 4: Advanced QA Features

- Import from CSV and Excel
- Bulk update and duplicate plans
- Flaky case reporting
- Build comparison views
- Notifications and assignments
- Android SDK exploration

## Key Technical Risks

## iOS Network Capture Coverage

- Not every app stack is intercepted the same way
- Mitigation:
  - design around a normalized event API
  - support wrapper-first integration
  - use `URLProtocol` selectively

## Local Pairing Reliability

- LAN conditions may be inconsistent
- Mitigation:
  - QR plus manual code
  - reconnect logic
  - local backlog buffering
  - trusted desktop identity with token expiry
  - explicit listener configuration for simulator and physical-device access

## Device Identity Spoofing

- A client can forge a device ID.
- Mitigation:
  - use the allowlist only for filtering during the concept phase
  - add short-lived pairing tokens
  - bind trusted device credentials after pairing
  - authenticate reconnects independently of the displayed device ID

## High-Volume Log Rendering

- Live payloads can overwhelm desktop UI
- Mitigation:
  - virtualized lists
  - body truncation
  - lazy detail rendering

## Sensitive Data Exposure

- Request and response data may contain secrets
- Mitigation:
  - redaction pipeline before persistence and transport
  - workspace access controls

## Recommended First Build Sequence

1. Shared domain schema and backend data model
2. Tauri desktop runner shell and pairing screen
3. iOS SDK capture and local streaming
4. Live log viewer on desktop
5. Test case and plan management UI
6. Session and bug persistence
7. Backend ingestion path for future web-based live viewer
