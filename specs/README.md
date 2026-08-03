# Specs — QA Test Management Platform

This directory holds the specifications for the **QA Test Management Platform**, organised so each tech stack can be built independently, by a person or an AI session, using **only its own folder**.

## Directory layout

```text
specs/
├── README.md                       # you are here — index + canonical product context
├── 001-test-management-platform/   # CANONICAL SOURCE (umbrella) — the single source of truth
│   ├── spec.md  plan.md  research.md  data-model.md  quickstart.md
│   ├── contracts/  checklists/
│   └── (do not delete — the four stack folders are derived from this)
├── frontend/                       # Desktop app (Tauri: Rust + React/TS)
├── backend/                        # Service (Go workspace + PostgreSQL + object store)
├── ios/                            # iOS capture SDK (Swift / SPM)
└── android/                        # Android capture SDK (Kotlin / AAR)
```

Each stack folder is **self-contained**: it repeats the product context below and carries its own `spec.md`, `plan.md`, `research.md`, `data-model.md`, `quickstart.md`, and the `contracts/` it participates in. Hand any one folder to a fresh session and it has everything needed to build that project. The umbrella folder remains the authoritative source; the stack folders are scoped derivations of it.

---

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

## How to use a single stack folder

Open the folder for your stack (`frontend/`, `backend/`, `ios/`, or `android/`) and read its `README.md` first — it repeats the Product Context above, then states exactly what that project builds and how it integrates. Then work through `spec.md` (requirements) → `plan.md` (approach & structure) → `data-model.md` / `research.md` (detail) → `quickstart.md` (how to validate it). The `contracts/` subfolder holds the integration surfaces that project must honour. You do **not** need the other three folders to build, test, or validate your project (FR-000, SC-018).

## Provenance

All stack folders are derived from `001-test-management-platform/` (spec v3, revised 2026-07-28). Requirement IDs (FR-/SC-/TC-), research IDs (R1–R21), and entity names are preserved across the split for traceability. Where a stack folder and the umbrella disagree, the umbrella wins.
