# Implementation Plan: QA Test Management Platform (Desktop + Go Backend + iOS SDK + Android SDK)

**Branch**: `001-test-management-platform` | **Date**: 2026-07-28 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-test-management-platform/spec.md` (v3)

**Supersedes**: the 2026-07-13 plan, which targeted three deliverables and a Node.js/NestJS backend. Both premises are gone — see Revision Notes.

## Revision Notes (what changed from the previous plan)

| Area           | Was (v2 plan)               | Now (v3 plan)                                                            |
| -------------- | --------------------------- | ------------------------------------------------------------------------ |
| Deliverables   | 3, in one monorepo          | **4 independently buildable projects** (FR-000)                          |
| Backend        | Node 20 + Fastify + Prisma  | **Go 1.24 workspace**, 3 modules, `net/http`, pgx                        |
| iOS hosts      | SwiftUI assumed             | **SwiftUI + UIKit, equal footing** (FR-049)                              |
| OS floors      | iOS 15 / Android 7 (API 24) | **iOS 13 / Android 6 (API 23)** (FR-050)                                 |
| SDK capture    | API traffic only            | API traffic **+ app logs + crashes + user actions + screenshots**        |
| Log inspection | Flat chronological          | **Grouped by user action** (FR-039)                                      |
| Media          | "screenshot metadata"       | Real binaries, device → desktop → **backend object storage** (FR-044)    |
| Versioning     | Unspecified                 | **Semver contracts, additive minors, handshake negotiation** (FR-000c–e) |
| Users          | 1 user ↔ 1 workspace (FK)   | **Global User, N↔N via Workspace Membership** (FR-001a, FR-056)          |
| Auth           | Deferred post-MVP           | **Google SSO in MVP**, PKCE + system browser, 30-day offline grace (FR-051…054) |

## Summary

Four separately-built projects integrating over three versioned contracts:

1. **Desktop (Tauri)** — test authoring, live session runner, action-grouped log inspector, reporting. Hosts the LAN WebSocket server devices dial into; owns a local SQLite store so sessions survive backend outages; runs a sync outbox to the backend.
2. **Backend (Go workspace)** — durable persistence and cross-device history. Three modules under one `go.work`: `api` (net/http handlers, one file per sync-api route group), `core` (all business logic; sole owner of the Postgres pool; `internal/store` is compiler-unreachable from `api`), `contracts` (DTOs shared by both). PostgreSQL 16 plus an S3-compatible object store for bug-attached media.
3. **iOS SDK (Swift)** — capture + overlay, working identically from SwiftUI and UIKit hosts, back to iOS 13.
4. **Android SDK (Kotlin)** — the same, back to Android 6 (API 23).

The hot path — device → desktop over local WebSocket — never touches the backend. General API logs, app logs and user actions are device-local, streamed, and clearable. Bugs and their evidence are local-first and sync; bug-attached media travels device → desktop → backend object storage as a separate, resumable transfer so a large video never blocks a bug record from syncing.

Two design decisions carry disproportionate weight and are justified in research: **the iOS overlay lives in its own `UIWindow`** (this single choice satisfies SwiftUI/UIKit parity, no-relayout hosting, and screenshot self-exclusion at once), and **user actions are captured at the window event-dispatch boundary** on both platforms (`UIWindow.sendEvent` / `Window.Callback.dispatchTouchEvent`), which is the only layer that sees SwiftUI and UIKit touches identically.

## Technical Context

**Language/Version**:

- Desktop — Rust (stable, Tauri 2.x) + TypeScript 5.x / React 18 (webview UI)
- Backend — **Go 1.24** (workspace mode; `go.work` with 3 modules)
- iOS SDK — Swift 5.9+, SPM package
- Android SDK — Kotlin 2.0, AAR library

**Primary Dependencies**:

- Desktop — Tauri 2.x, React + Vite, `tokio-tungstenite` (WS server), `rusqlite` (local store)
- Backend — **stdlib `net/http`** (Go 1.22+ `ServeMux` method+pattern routing — no web framework), `jackc/pgx/v5` (Postgres), `pressly/goose` (embedded SQL migrations), an S3-compatible SDK for object storage, and a JWKS/JWT verifier for Google ID tokens. Deliberately no ORM and no auth framework — verification is ~100 lines against Google's published keys.
- Desktop auth — system browser + ephemeral `127.0.0.1` loopback listener (Authorization Code + PKCE, **no client secret**); session credential stored in the OS keychain
- iOS — `URLProtocol` (traffic), swizzled `UIWindow.sendEvent` (actions), `NSSetUncaughtExceptionHandler` + signal handlers (crashes), `UIGraphicsImageRenderer` (screenshots), `URLSessionWebSocketTask` (transport)
- Android — OkHttp `Interceptor` (traffic), wrapped `Window.Callback` (actions), `Thread.UncaughtExceptionHandler` (crashes), `PixelCopy`/`View.draw` (screenshots), OkHttp `WebSocket` (transport)

**Storage**:

- Backend — PostgreSQL 16 (relational) + S3-compatible object store (media binaries). `DATABASE_URL` and storage config read once at startup by `config.go`, fail-fast.
- Desktop — SQLite (local-first durable store: sessions, results, bugs, evidence, device registrations, sync outbox, media staging)
- Mobile — SQLite/Room + files: bounded ring buffers for logs/actions, durable store for crash reports and the capture library (500 MB cap, FR-047)

**Testing**: Backend — `go test` (+ `testcontainers-go` for store/integration against real Postgres); Desktop — `cargo test` + Vitest; iOS — XCTest; Android — JUnit5 + Robolectric + instrumentation; cross-project — a shared conformance suite replaying fixtures through both SDKs (Principle II).

**Target Platform**: Desktop — macOS 12+, Windows 10+, Linux. Backend — Linux container. **iOS 13+**. **Android 6.0 / API 23+**.

**Project Type**: Four independent projects (desktop app, backend service, two mobile SDK libraries) integrating over versioned contracts.

**Performance Goals**: Live event visible on desktop within ~2s including in-progress state (SC-003); log viewer smooth at 50 events/sec with 10k+ events retained (virtualized); no main-thread blocking from any SDK capture path (FR-029, SC-017); ≥95% correct action attribution (SC-010).

**Constraints**: Redaction at source, backend 422 defensive gate; pairing token single-use + 5-min TTL; `allowlist` default; ≥2 concurrent isolated sessions; zero in-session data loss during backend outage; full core capture set must work at the OS floors (FR-050a); no host-app instrumentation API for actions (FR-039f).

**Scale/Scope**: Multi-workspace; a user may belong to many, low tens of devices per workspace. 8 user stories, ~100 functional requirements, 21 entities, 1 exploration spike (EX-001).

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design._

### Initial check (pre-research)

| #   | Principle                      | How this plan complies                                                                                                                                                                                                                                                               | Status        |
| --- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- |
| I   | Privacy & Redaction by Default | Redaction runs in each SDK's capture pipeline before buffer/stream/store, now extended to app-log messages (FR-037b) and secure-text-entry suppression in action capture (FR-039g). Backend `core/redaction` is an independent 422 gate that never substitutes for source redaction. | ✅ Pass       |
| II  | Cross-Platform SDK Parity      | One wire protocol, one redaction spec, one action-taxonomy, one capability set — enforced by a shared conformance suite that fails the build on divergence. Capture mechanisms differ per platform; observable output must not.                                                      | ✅ Pass       |
| III | Local-First Resilience         | Device→desktop path is backend-independent. Desktop SQLite is durable. Bugs queue in an outbox; media queues separately (FR-044a) so an offline backend degrades evidence _visibility_, never the session or the bug record. **Auth is the one new backend dependency** — neutralised by a cached session with 30-day offline grace (R20). | ⚠️ D3 |
| IV  | Test-First Development         | Contracts + data-model produce failing tests before implementation in all four projects. Redaction, sync idempotency, action attribution and session continuity get explicit tests traced to FR/SC IDs.                                                                              | ✅ Pass       |
| V   | Spec-Driven Development        | Every artifact traces to FR-/SC-/TC- IDs. Two spec-vs-platform tensions surfaced rather than coded around — see Constitution Deltas below.                                                                                                                                           | ⚠️ See deltas |
| VI  | Simplicity & YAGNI             | Backend uses stdlib `net/http` and hand-written SQL — no framework, no ORM, no code generation. Three Go modules exist because FR-000/TC-001 mandate the boundary, not for speculative reuse. Screen recording deferred to a spike rather than built on faith.                       | ✅ Pass       |

### Constitution Deltas — surfaced, not coded around (Principle V)

Two places where the spec's requirements collide with platform reality. Both are resolved in research; neither is a violation, but both changed the design:

- **D1 — iOS app-log capture at the iOS 13 floor.** FR-050a demands the full core capture set works at iOS 13. `OSLogStore`, the obvious way to read a host app's logs, is **iOS 15+**. Resolution (R12): the SDK ships its own log facade plus `stderr`/`NSLog` interception as the primary path, which works at iOS 13; `OSLogStore` is an _additive enhancement_ on iOS 15+, not the mechanism. Had we made `OSLogStore` primary, FR-050a would have been quietly violated on every iOS 13/14 device.
- **D2 — Android screenshots at API 23.** `PixelCopy` is **API 24+**. Resolution (R15): `View.draw(Canvas)` is the primary path (API 23-compatible), `PixelCopy` an enhancement on API 24+ where it correctly captures `SurfaceView`/video content. Parity note: this makes `SurfaceView` content a documented, _matched_ coverage boundary on both platforms rather than a silent per-OS difference (Principle II).
- **D3 — Authentication vs local-first resilience.** Principle III guarantees a live session survives an unreachable backend with zero data loss (SC-005). Moving Google SSO into MVP introduces the product's **first hard backend dependency**, and the obvious implementation — check auth at launch — would break that guarantee outright: an offline test lab could not test at all. Resolution (R20): the backend mints a session the desktop caches alongside a membership snapshot, with a 30-day offline grace inside which **no auth network call happens at all**. Sign-in becomes the single connectivity-dependent moment in the product. Grace expiry may gate starting a *new* session; it may never interrupt a running one or block reading local data (FR-053a).
  - **Accepted cost, recorded rather than buried**: revocation is not instantaneous. A user removed from a workspace keeps working offline until grace lapses; the backend rejects that workspace's records on reconnect, and the desktop must surface the rejection instead of silently dropping the queue. Instant revocation would require a per-operation online check — exactly what Principle III forbids.

**Result**: PASS. No unjustified violations; Complexity Tracking records the one structural cost worth naming.

## Project Structure

### Documentation (this feature)

```text
specs/001-test-management-platform/
├── plan.md              # This file
├── research.md          # Phase 0 — 18 decisions (R1–R18)
├── data-model.md        # Phase 1 — 17 entities across 3 stores
├── quickstart.md        # Phase 1 — 10 validation scenarios
├── contracts/           # Phase 1 — the three cross-project contracts
│   ├── device-desktop-ws.md    # SDK ↔ desktop local WebSocket (semver v1)
│   ├── sync-api.md             # Desktop ↔ backend REST (semver v1) — route groups map 1:1 to api module files
│   └── sdk-public-api.md       # Embeddable SDK surface (iOS + Android)
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

Four sibling projects. Each builds, tests, and releases on its own (FR-000, SC-018) — no shared build graph, no cross-project source imports.

```text
desktop/                        # PROJECT 1 — Tauri desktop app
├── src-tauri/                  # Rust core
│   ├── src/
│   │   ├── ws/                 # LAN WS server, allowlist + token gate, capability handshake
│   │   ├── store/              # SQLite (sessions, results, bugs, evidence, devices, outbox)
│   │   ├── pairing/            # QR/token issue + single-use validation
│   │   ├── auth/               # PKCE + loopback listener, keychain cache, offline grace, workspace switch
│   │   ├── sync/               # backend REST client: record outbox + separate media outbox
│   │   ├── actions/            # action-group assembly from the event stream
│   │   └── redaction/          # defensive re-scan (never the primary gate)
│   └── tests/
└── src/                        # React + TS webview UI
    ├── features/               # test-cases, test-plans, runner, log-inspector, reporting, devices
    └── __tests__/

backend/                        # PROJECT 2 — Go workspace
├── go.work                     # binds the three modules below
├── contracts/                  # MODULE: shared DTOs, imported by api + core
│   ├── go.mod
│   └── *.go                    # request/response types mirroring contracts/sync-api.md
├── core/                       # MODULE: all business logic; SOLE owner of the Postgres pool
│   ├── go.mod
│   ├── config.go               # reads env ONCE at startup, fails fast; no scattered os.Getenv
│   ├── sync.go                 # idempotency dedupe → 409 on conflicting concurrent update
│   ├── auth.go                 # Google ID-token verification (JWKS), session minting, membership checks
│   ├── workspaces.go           # workspace + membership management
│   ├── bugs.go  sessions.go  testcases.go  testplans.go  devices.go  reports.go  media.go
│   ├── redaction/              # defensive gate → 422 on unredacted sensitive key
│   └── internal/store/         # SQL + pgx; UNREACHABLE from api (Go internal rule, compiler-enforced)
│       └── migrations/         # goose SQL migrations, embedded
├── api/                        # MODULE: net/http handlers ONLY — no direct DB access
│   ├── go.mod
│   ├── main.go                 # reads PORT, wires core services, starts server
│   └── handlers_*.go           # one file per route group in contracts/sync-api.md
└── deploy/                     # docker-compose (Postgres 16 + object store) for local dev

sdk-ios/                        # PROJECT 3 — Swift Package; follows EDTS iOS guidelines
├── Sources/QASDK/
│   ├── Capture/                # URLProtocol traffic, log facade, crash handler, action observer
│   ├── Redaction/              # shared spec, applied at capture time
│   ├── Transport/              # WS client, reconnect, bounded backlog
│   ├── Overlay/                # own UIWindow — works for SwiftUI AND UIKit hosts, self-excluding
│   └── Integration/            # UIKit + SwiftUI entry points over one shared core
└── Tests/QASDKTests/

sdk-android/                    # PROJECT 4 — Kotlin AAR
├── src/main/kotlin/
│   ├── capture/                # OkHttp interceptor, log tree, crash handler, Window.Callback actions
│   ├── redaction/  transport/
│   └── overlay/                # WindowManager overlay — self-excluding from captures
└── src/test/ + src/androidTest/

conformance/                    # Cross-SDK parity suite (Principle II) — runs against both SDKs
```

**Structure Decision**: Four independent projects, with the backend internally structured as a Go workspace exactly as specified in TC-001 and the supplied architecture diagram.

The Go workspace's value here is **compiler-enforced layering**, not organisation. Because `api` and `core` are separate modules, `core/internal/store` is unreachable from `api` by Go's `internal` rule — "no direct DB access from handlers" stops being a code-review convention and becomes a build error. That is the entire justification for three modules instead of three packages; without the `internal` boundary they would be over-engineering under Principle VI.

**Naming hazard worth fixing early**: `backend/contracts/` (a Go module of DTOs, internal to the backend) and `specs/.../contracts/` (the three cross-project integration contracts) are different things. The Go module is an _implementation detail of one project_; the spec contracts are the _published integration surface_. Renaming the Go module to `dto` would remove the ambiguity, but the diagram names it `contracts` — keeping the diagram's name and documenting the distinction here.

## Complexity Tracking

| Structural cost                                          | Why needed                                                                                                                                             | Simpler alternative rejected because                                                                                                                                                                                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3 Go modules instead of 1 module with 3 packages         | TC-001 mandates that store code not be importable outside core; only a module boundary makes Go's `internal` rule enforce it across the api/core split | A single module with `internal/store` at its root would make store reachable from every package in the module, including handlers — the exact coupling the architecture exists to prevent. Convention-only enforcement fails silently under time pressure. |
| Separate media transfer path alongside the record outbox | FR-044b requires a Bug's record to sync independently of a possibly-large binary                                                                       | One outbox carrying both would make a 5-minute video block a 2 KB bug record, breaking SC-005's "no loss, no blocking" expectation during flaky connectivity                                                                                               |
| Overlay in its own window (both platforms)               | Satisfies FR-049b (no host relayout), FR-046 (self-exclusion from captures), and SwiftUI/UIKit parity with one mechanism                               | Injecting the overlay into the host's view hierarchy would require the host to wrap its root view (violating FR-049b) and would make excluding it from screenshots a per-host special case                                                                 |

## Phase Status

- [x] Phase 0 — research.md (18 decisions, all NEEDS CLARIFICATION resolved)
- [x] Phase 1 — data-model.md, contracts/ (3, all revised), quickstart.md
- [x] Constitution re-check post-design — PASS, deltas D1/D2 resolved in research
- [ ] Phase 2 — tasks.md (`/speckit-tasks`)
