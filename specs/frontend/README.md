# Frontend — Desktop App (Tauri)

## Product Context

> This section is the shared, canonical description of the whole product. It is **duplicated verbatim into every stack folder's README** so that each folder stands alone. If you edit it, edit it in all copies (or regenerate the stack folders from the umbrella).

### What this product is

A **QA Test Management Platform** that turns manual mobile testing into a device-in-the-loop session with live visibility. A QA team authors test cases and plans on a desktop app, pairs a physical iOS or Android device running a host app with an embedded QA SDK, runs a manual test session, and watches the device's API traffic, app logs, user actions, crashes, and screenshots stream to the desktop in real time — grouped by the user action that produced them. Testers flag bugs mid-session without stopping it, capturing a time-windowed slice of evidence that syncs to a backend so anyone on the team can review it later.

### Why it exists (the problems it solves)

- **A flat log stream is unusable during live testing** — you cannot tell which of a dozen concurrent requests belongs to the thing you just tapped. The platform groups all captured activity under the **user action** that caused it.
- **Manual mobile QA loses evidence** — the platform captures API/network traffic, app logs, crashes, and screenshots on-device and preserves a configurable window around each bug.
- **Testing must not depend on connectivity** — the device→desktop path is fully local; sessions keep working when the backend (or the whole network) is unreachable.
- **Sensitive data must never leak** — secrets are redacted on-device before anything is stored, streamed, or transmitted, with a defensive backend gate as backup.

### Delivery model — four independent projects

The product is delivered as **four separately-built, separately-versioned projects** that integrate only over published, semantically-versioned contracts (no shared source):

| Project | Folder | Tech stack | Role |
| --- | --- | --- | --- |
| **Frontend / Desktop** | `frontend/` | Tauri 2.x (Rust core + React/TS webview) | Test authoring, live session runner, action-grouped inspector, bug capture, reporting, Google-SSO auth, local-first SQLite. Hosts the LAN WebSocket server; the only uploader of bug media to the backend. |
| **Backend** | `backend/` | Go 1.24 workspace (`api`/`core`/`contracts`) + PostgreSQL 16 + S3-compatible object store | Durable persistence, identity verification + session minting, workspace membership/authorization, idempotent sync, media object storage, defensive redaction gate. Headless; its only client is the desktop. |
| **iOS SDK** | `ios/` | Swift 5.9+ / SPM, **iOS 13+** | On-device capture (traffic, app logs, crashes, user actions, screenshots) + embedded overlay, working identically from **SwiftUI and UIKit** hosts. Pairs to a desktop; unauthenticated. |
| **Android SDK** | `android/` | Kotlin 2.0 / AAR, **Android 6 / API 23+** | The same capture + overlay on Android. Pairs to a desktop; unauthenticated. |

The two SDKs must produce **equivalent observable output** (Principle II) — capture mechanisms differ per platform, the captured data must not. A shared conformance suite fails the build on divergence.

### The three contracts (integration surfaces)

1. **`device-desktop-ws`** — SDK ↔ desktop local WebSocket. Desktop is server; each SDK is a client. Carries live capture and pairing. (frontend, ios, android)
2. **`sync-api`** — desktop ↔ backend REST. Desktop is client; backend is server. Carries durable content + bug/evidence sync + media upload. (frontend, backend)
3. **`sdk-public-api`** — the embeddable SDK surface a host app integrates against. (ios, android)

**Versioning rule (FR-000c–e):** each contract is semver'd independently. Same **major** → peers connect; **additive** minors (a peer ignores fields/messages it doesn't recognise); **major** mismatch → connection refused with a message naming which side is out of date. Peers exchange version + capabilities at handshake, and any capability an older peer lacks is shown as *unavailable-because-out-of-date* — never silently absent, never silently degraded.

### The hot path and durability model

The hot path — **device → desktop over local WebSocket — never touches the backend.** Three durability classes:

- **Device-local, ephemeral (never synced to backend):** API Log Events, App Log Events, User Actions. Streamed to the desktop; clearable from either side.
- **Device-durable (survives app restart):** Crash Reports and the on-device capture library (screenshots; recordings if EX-001 ships), under a 500 MB cap.
- **Desktop-durable, synced to backend:** Test content, sessions, results, bugs, and evidence. Bug-attached media travels device → desktop → backend object storage as a **separate, resumable** transfer so a large video never blocks a small bug record from syncing.

### Product-wide constraints & principles

- **TC-001** four separate projects; backend is a Go workspace with a compiler-enforced `internal/store` boundary. **TC-002** backend reads config once at startup (fail-fast), persists to PostgreSQL. **TC-003** redaction on-device + defensive backend gate. **TC-004** idempotent sync. **TC-005/005a** SDKs are consumable dependency artifacts; backend provides durable object storage addressed independently of the record.
- **Principle I** Privacy & redaction by default. **II** Cross-platform SDK parity. **III** Local-first resilience (sessions survive backend/network outages; a cached auth session with a 30-day offline grace keeps sign-in from breaking this). **IV** Test-first. **V** Spec-driven. **VI** Simplicity/YAGNI.
- **Auth:** Google SSO only (email/password out of scope), identity keyed on the provider's stable subject (not email). Sign-in is the single connectivity-dependent moment; a cached session with 30-day offline grace covers everything else.
- **Access:** a User is global and belongs to many Workspaces via explicit Membership; every member is `admin` for now (role differentiation deferred); membership is the server-enforced access boundary.
- **EX-001 spike:** screen **recording** is optional and unproven — gated behind a feasibility spike. **Screenshots are committed.** If recording is not delivered, the SDKs expose no recording control at all.

### Priorities (user stories, in build order)

US1 author test cases/plans (P1) → US2 pair a device & run a session (P2) → US3 inspect activity grouped by user action (P3) → US4 flag a bug mid-session (P4) → US5 capture screenshots/[recordings] (P5) → US6 on-device debugging overlay with/without a desktop (P6) → US7 reporting & history (P7) → US8 bulk import (P8).

---

## What this project builds

The desktop app is the QA team's primary workstation and the hub of the whole product. It builds the **test-authoring surface** (full CRUD for Test Cases and Test Plans, bulk import, search/filter/sort), the **live session runner** (device pairing, session start/stop, and the real-time streaming viewer), the **action-grouped log inspector** (the desktop half of the grouped/flat inspector), **bug capture and evidence assembly** (the "Bug Occurred" marker, the configurable evidence window, and routing attached media to durable storage), **reporting and history** (pass/fail by plan, failed cases by build, bugs by environment), and **authentication + workspace switching** (Google SSO via the system browser, a cached session with offline grace, and the active-workspace selector).

Architecturally the desktop is a **Tauri 2.x** application: a Rust core owns the network and storage surface, while a React/TypeScript webview renders the data-dense UI. The Rust core hosts the **LAN WebSocket server** that mobile devices dial into, runs the allowlist + pairing-token gate and the capability handshake, keeps a durable **local-first SQLite** store, and drives two outboxes to the backend — a record outbox and a **separate** media outbox. This local-first design is what lets a device→desktop session keep capturing through a full backend or network outage; the backend is a durable, shared destination, never a runtime dependency of a live session.

The desktop is also the **only** component that talks to the backend and the **only** uploader of bug media (devices never reach the backend directly). Bug-attached binaries travel device → desktop → backend object storage as a resumable transfer, so a large video never blocks a small bug record from syncing. Everything the desktop renders is scoped to a single **active workspace**, and that scope is respected locally while the backend enforces membership on every request.

## Scope: owned vs. delegated

| Concern | Owner |
| --- | --- |
| Test Case / Test Plan authoring, bulk import, search/filter/sort | **Desktop (this project)** |
| Live session runner: pairing UI, start/stop, live viewer | **Desktop (this project)** |
| Action-grouped log inspector (grouped/flat, Unattributed, empty groups) | **Desktop (this project)** |
| Bug capture, evidence window assembly, media staging + upload | **Desktop (this project)** |
| Reporting & history views | **Desktop (this project)** |
| Google SSO (PKCE loopback), cached session + offline grace, workspace switch | **Desktop (this project)** |
| LAN WebSocket server, allowlist + token gate, capability handshake | **Desktop (this project)** — `contracts/device-desktop-ws.md` |
| Local-first SQLite store + record outbox + media outbox | **Desktop (this project)** |
| On-device capture (API traffic, app logs, crashes, user actions, screenshots) | iOS SDK / Android SDK |
| Mobile overlay UI, on-device pairing screen, on-device session history | iOS SDK / Android SDK |
| Redaction *at source* (the real privacy gate) | iOS SDK / Android SDK |
| Durable persistence, identity verification, session minting, membership enforcement, defensive redaction 422, object storage | Backend |

The desktop **re-scans defensively** for unredacted sensitive keys but never treats that as the gate; redaction at source (SDKs) and the backend's 422 are the real gates.

## Build & validate standalone

The desktop is independently buildable, testable, and releasable without the other three projects present (**FR-000**, **SC-018**).

```bash
# Prerequisites: Rust (stable) + Node 20
cd desktop && npm install && npm run tauri dev
```

Tests: `cargo test` (Rust core) + Vitest (webview). Target platforms: **macOS 12+, Windows 10+, Linux**.

**Contracts it must honour** (both under `contracts/`):

- `contracts/device-desktop-ws.md` — the desktop is the **WebSocket server**. It runs the allowlist + single-use-token gate, the capability handshake, and de-duplicates/attributes incoming records. Must ignore unknown fields/message types (FR-000d) and refuse a contract-major mismatch by naming the out-of-date peer (FR-000c).
- `contracts/sync-api.md` — the desktop is the **REST client**. Record outbox + separate media outbox, idempotency keys, `X-Contract-Version` handshake, `503` treated as a non-event, `duplicate` (not `409`) on replay.

**What the desktop can validate alone** (no peer needed):

- Scenario 0 — builds and tests from a clean checkout.
- Scenario 1 — author Test Cases & Plans, derived summary status, soft delete.
- Scenario 5 — reporting & history against local session/bug data.
- Scenario 13 — bulk import with row-level error preview.
- Scenario B (offline portion) — offline grace with a cached session; the *initial* sign-in that seeds the cache needs the backend once.

**What needs a peer:**

- Scenario A (Google sign-in + multi-workspace) — needs the **backend** (token exchange, `/v1/me`, `403`/`401` scoping).
- Scenarios 2, 3, 4, 8 — need an **SDK peer** (a paired device streaming capture) to exercise pairing, live streaming, action grouping, mid-session bug capture, and the allowlist gate end-to-end.
- Scenario 6 — needs an **SDK peer + backend** to prove outage resilience (503 non-event, replay = `duplicate`).
- Scenario 12 — needs a **peer** one contract-minor/major off to prove handshake compatibility and refusal.

## Files in this folder

- `spec.md` — the desktop-scoped requirements (User Stories, FRs, SCs, entities), derived from the umbrella spec v3.
- `plan.md` — the desktop implementation plan: role, Technical Context, `desktop/` structure, key design decisions, constitution/complexity notes, phase status.
- `research.md` — the desktop-relevant Phase 0 decisions (R1–R4, R7, R9–R11, R16, R18–R21), preserving R-numbers.
- `data-model.md` — the desktop SQLite (local-first) store: owned/cached entities, staging, and cross-entity integrity rules.
- `quickstart.md` — the desktop-scoped validation guide: prerequisites, scenarios (flagging peer requirements), and a traceability table.
- `contracts/` — the two integration surfaces the desktop honours: `device-desktop-ws.md` (desktop is **server**) and `sync-api.md` (desktop is **client**).

## Definition of done

The desktop must pass these gates (IDs preserved from the umbrella spec; *(peer)* marks a gate that needs an SDK and/or the backend present):

| Gate | What it proves | Key FRs |
| --- | --- | --- |
| **SC-001** | Create a Test Case and add it to a Test Plan in under 2 minutes without external docs | FR-003…011 |
| **SC-002** *(peer: SDK)* | Pair a new device using only a QR scan or short pairing code — no manual network address in the default flow | FR-016, FR-020a |
| **SC-003** *(peer: SDK)* | An API call on the paired device appears in the live view within a couple of seconds, incl. an in-progress row | FR-025, FR-035a |
| **SC-004** | Raise multiple "Bug Occurred" markers in one session without stopping or losing data | FR-013, FR-030…032 |
| **SC-005** | With the backend unreachable, a running session keeps capturing/displaying with no in-session loss | FR-035, FR-035b |
| **SC-007** | Reporting views match underlying session/bug data with zero discrepancies | FR-033, FR-034 |
| **SC-008** | An unregistered/disabled device's traffic never appears in the live viewer while policy is `allowlist` | FR-017, FR-018 |
| **SC-009** | A mixed valid/invalid import commits only valid rows, invalid rows flagged before commit | FR-008 |
| **SC-013a** *(peer: backend)* | A bug with an attached capture is viewable by a different person on a different machine once upload completed | FR-044, FR-044a/b |
| **SC-018** | The desktop builds and runs its tests from a clean checkout without the other three projects | FR-000 |
| **SC-019** *(peer: SDK)* | A desktop one contract-minor ahead of an SDK runs a full session; desktop-only capability shown as *unavailable-for-this-device* | FR-000d/e |
| **SC-020** *(peer)* | A peer one contract-major behind is refused at handshake naming the out-of-date side — never partially connected | FR-000c |
| **SC-021** | A user in three workspaces signs in once and switches all three with zero cross-workspace leakage | FR-001, FR-056a…d |
| **SC-022** | Fully offline with a valid cached session, run a full session end-to-end with no sign-in prompt | FR-052a, FR-053, FR-053a |
