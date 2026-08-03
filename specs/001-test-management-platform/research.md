# Phase 0 Research: QA Test Management Platform (v3)

Resolves the open technical choices behind [plan.md](plan.md). Each entry: Decision / Rationale / Alternatives. The spec's `## Technical Constraints` (TC-001..TC-005a) are **fixed inputs**, not open questions — research fills the gaps around them.

**Revised for v3.** R1–R4, R7, R9–R11 carry forward largely intact. **R5, R6, R8 changed materially** (iOS/Android OS floors; backend is now Go). **R12–R18** cover app logs, crashes, action capture, screenshots, media transfer, dual-host iOS, and contract versioning. **R19–R21 are the newest**, added when authentication moved from post-MVP into scope: Google SSO from a desktop app, offline session grace, and multi-workspace access control.

---

## R1 — Desktop webview UI stack

- **Decision**: React 18 + TypeScript + Vite inside Tauri 2.x.
- **Rationale**: The design-canvas mockups in `QATools.zip` are authored in `.jsx`, so React is the lowest-friction path to the intended UI. Vite is Tauri's default. TypeScript carries the protocol types.
- **Alternatives**: Svelte/SolidJS (discards existing mockups); native Rust GUI (far more effort for a data-dense CRUD + log UI).

## R2 — Desktop local persistence

- **Decision**: SQLite via `rusqlite` in the Tauri Rust core.
- **Rationale**: Principle III needs a durable local store so sessions and bugs survive backend outages. Embedded, transactional, zero-ops; structured queries back the reporting views (FR-033/034).
- **Alternatives**: Flat JSON (no transactions, poor for reporting); embedded Postgres (heavyweight); Tauri Store plugin (key-value only).

## R3 — Device↔desktop transport & topology

- **Decision**: Desktop hosts a LAN WebSocket server (`tokio-tungstenite`); each SDK is a client. One desktop accepts multiple concurrent device connections, each mapped to its own session.
- **Rationale**: Spec mandates WebSocket, real-time in-progress streaming (FR-025), backend-independent operation (FR-035), and ≥2 concurrent isolated sessions (FR-021). Desktop-as-server means devices dial a QR-encoded address — no manual IP entry (FR-016).
- **Alternatives**: Device-as-server (desktop must discover/scan — worse UX); routing through the backend (violates Principle III, adds latency, fails offline).

## R4 — Pairing mechanism

- **Decision**: Desktop mints a single-use token (5-min TTL) and renders a QR encoding `{ws_url, token, contract_version}`; a short numeric code is the manual fallback. On connect the SDK presents the token; the desktop validates once, binds the device to a registration, then issues a longer-lived per-device reconnect credential.
- **Rationale**: Implements FR-016/020/020a and the "device ID ≠ authentication" edge case. Single-use + TTL closes the replay window; the reconnect credential enables automatic re-pairing (US2 scenario 7) without re-scanning.
- **Alternatives**: Static shared secret (replayable); mDNS auto-trust (no human-in-the-loop authorization).

## R5 — iOS traffic interception *(revised: OS floor iOS 15 → 13)*

- **Decision**: `URLProtocol` subclass registered by the SDK, capturing the request/response lifecycle; WS via `URLSessionWebSocketTask`.
- **Rationale**: The standard non-invasive way to observe `URLSession` traffic without the host rewriting its networking, and it runs off the main thread (FR-029). **Both APIs are available from iOS 13**, so the lowered floor (FR-050) costs nothing here — unlike app-log capture, which it does affect (see R12).
- **Alternatives**: Swizzling `URLSession` (fragile, ABI-risky); requiring the host to inject a custom `URLSession` (invasive; misses third-party SDK traffic).
- **Coverage boundary**: background `URLSession`s and non-`URLSession` transports (raw `Network.framework`, some gRPC) are not auto-captured. Deliberately matched to Android's boundary (R6).

## R6 — Android traffic interception *(revised: OS floor API 24 → 23)*

- **Decision**: OkHttp application-level `Interceptor` as the primary capture path; WS via OkHttp `WebSocket`.
- **Rationale**: OkHttp is the de-facto Android HTTP client (Retrofit sits on it); an interceptor captures the full lifecycle equivalently to iOS's `URLProtocol`, off the main thread (FR-029). **OkHttp 4.x supports API 21+**, so the API 23 floor is satisfied.
- **Alternatives**: `HttpURLConnection` wrapper (misses OkHttp/Retrofit apps); `VpnService` packet capture (invasive, needs system permission, can't cleanly decode TLS bodies).
- **Coverage boundary**: non-OkHttp clients (raw `HttpURLConnection`, Cronet) are not auto-captured — matched to iOS's boundary so "what the SDK sees" means the same thing on both platforms (Principle II).

## R7 — Redaction strategy (shared spec, per-SDK impl)

- **Decision**: One declarative redaction spec applied identically in both SDKs at capture time: case-insensitive key match on headers and on structured (JSON / form-urlencoded) body fields for `Authorization`, `Cookie`, `token`, `password`, `apiKey`; matched values replaced with `«redacted»`. **Extended in v3 to app-log message bodies** (FR-037b). Desktop and backend re-scan defensively but never rely on it.
- **Rationale**: Redaction at source is the constitution's hard gate. A shared data-driven spec is what makes iOS/Android parity testable rather than two drifting implementations.
- **Alternatives**: Redact only on the desktop (violates Principle I — raw data already left the device); regex-over-raw-bytes (misses structure, high false-negative rate on nested JSON).

## R8 — Backend service *(REPLACED: Node.js/Fastify/Prisma → Go workspace)*

- **Decision**: **Go 1.24 workspace** (`go.work`) with three modules, exactly as the supplied architecture diagram specifies:
  - **`contracts`** — shared DTOs, imported by both `api` and `core`. No behaviour.
  - **`core`** — all business logic and the **sole owner of the Postgres pool**. Contains `config.go` (reads env once at startup, fails fast), `sync.go` (idempotency dedupe → 409), `redaction/` (defensive gate → 422), service methods (Sync, Bugs, Sessions, TestCases, TestPlans, Devices, Reports, Media), and `internal/store/` for all SQL.
  - **`api`** — `net/http` handlers only, one file per route group in `contracts/sync-api.md`. **No direct DB access.**
  - Stack: stdlib `net/http` (Go 1.22+ `ServeMux` supports method+path patterns), `jackc/pgx/v5`, `pressly/goose` with embedded SQL migrations. PostgreSQL 16. `PORT` and `DATABASE_URL` from env.
- **Rationale**: The decisive property is that **`core/internal/store` is unreachable from `api` by Go's `internal` rule**, because they are separate modules. "Handlers must not touch the database" becomes a compile error rather than a review comment — which is the only reason three modules beat three packages under Principle VI. Go also gives a single static binary, trivial containerisation, and no ORM layer to fight when the sync semantics (idempotency, partial-batch results) get specific.
- **Alternatives**:
  - *Node.js + Fastify + Prisma* (the v2 plan) — rejected by TC-001.
  - *A Go web framework (Gin/Echo/Fiber)* — rejected under Principle VI: `net/http` since 1.22 routes methods and path params natively, and the diagram explicitly says "net/http handlers". A framework would add a dependency for zero capability.
  - *An ORM (GORM/ent)* — rejected. Sync needs precise control over conflict detection, upsert semantics and batch partial-success reporting; hand-written SQL behind `internal/store` is clearer and testable.
  - *Single Go module, three packages* — simpler, but loses the compiler-enforced boundary that is the whole point (see plan's Complexity Tracking).

## R9 — Sync & durability model *(revised: media path added)*

- **Decision**: Desktop writes bugs/sessions/results to SQLite first, then a background **record outbox** pushes them with idempotency keys. **A second, independent media outbox** transfers bug-attached binaries (FR-044a/b). De-duplication uses stable `event_id`/`request_id`; the backend's `sync.go` returns `duplicate` for replays and `409` for genuinely conflicting concurrent updates.
- **Rationale**: Implements FR-035a/b and the "exactly one entry per unique event" edge case. Two outboxes rather than one because FR-044b explicitly requires a Bug record to sync independently of its media — a 5-minute video must never hold up a 2 KB bug record.
- **Alternatives**: Synchronous write-through (breaks under outage — violates Principle III); one combined outbox (violates FR-044b); CRDTs (overkill for single-writer-per-record MVP data).

## R10 — Log viewer performance under high volume

- **Decision**: Virtualized list with a capped in-memory ring buffer per session and coalesced render updates; older events spill to SQLite and page back on scroll. **Grouped mode virtualizes at the group level**, with lazy expansion of each group's records.
- **Rationale**: SC-003 and the high-volume edge case require the viewer to stay responsive without dropping the UI. Target: smooth at 50 events/sec with 10k+ events retained.
- **Alternatives**: Render-all (freezes under load); drop-on-overflow without persistence (loses evidence a bug marker may need).

## R11 — Testing approach (TDD, Principle IV)

- **Decision**: Contract-first. `contracts/` + `data-model.md` produce failing tests before implementation in each project: backend (`go test` + `testcontainers-go` against real Postgres), desktop (`cargo test` + Vitest), iOS (XCTest), Android (JUnit5/Robolectric). A shared `conformance/` suite replays canned traffic, log lines, and synthetic gesture sequences through both SDKs and asserts identical redacted output and identical wire frames.
- **Rationale**: TDD is non-negotiable; a shared conformance suite is the only practical way to keep two SDKs provably at parity. `testcontainers-go` rather than a mocked store because the sync semantics under test (idempotency, 409 conflicts, partial batches) are database behaviour — mocking them would test the mock.
- **Alternatives**: Per-SDK bespoke tests only (parity drifts undetected); manual QA of redaction (unacceptable for a security gate).

---

## R12 — App-log capture *(new; resolves Constitution Delta D1)*

- **Decision**:
  - **iOS**: the SDK ships a **log facade** (`QALog.debug/info/warn/error`) plus interception of `stderr` (which captures `NSLog` and `print`). This is the **primary** path and works at **iOS 13**. `OSLogStore` reading of the host's `os_log` output is an **additive enhancement gated to iOS 15+**.
  - **Android**: a `Timber`-compatible tree plus the same facade; optionally reading the app's own logcat buffer via `Runtime.exec("logcat")` where permitted.
- **Rationale**: **This is the delta that nearly broke FR-050a.** `OSLogStore` is the natural way to read a host app's logs on iOS — and it does not exist before iOS 15. Making it primary would have silently violated "the full core capture set MUST function at the minimum supported OS" on every iOS 13/14 device, which is exactly the class of quiet degradation FR-050b forbids. Inverting it (facade primary, `OSLogStore` additive) keeps the floor honest.
  - On Android, an app has been able to read only *its own* logcat output since Android 4.1, so `Runtime.exec("logcat")` is safe but returns only host-app lines — acceptable, since that is precisely the scope we want.
- **Consequence for parity (Principle II)**: on both platforms, logs written through the SDK facade are always captured; logs written to the platform's native logger are captured on a best-effort basis with a **documented, matched** boundary. The conformance suite asserts identical output for facade-written logs.
- **Alternatives**: `OSLogStore`-primary (breaks the iOS 13 floor); requiring host apps to route logging through the SDK only (fails on third-party library logs); `READ_LOGS` permission on Android (system-only, not grantable to a normal app).

## R13 — Crash capture

- **Decision**: `NSSetUncaughtExceptionHandler` plus `signal()` handlers for fatal signals on iOS; `Thread.setDefaultUncaughtExceptionHandler` on Android. Both **chain to any previously installed handler** and write the crash record via async-signal-safe primitives to a pre-allocated file, then rethrow. The surrounding API/app-log window is snapshotted from the in-memory ring buffer at crash time.
- **Rationale**: FR-038b requires that SDK crash handling neither prevents the host's own crash reporting nor itself crashes the app. Chaining is what makes the SDK coexist with Crashlytics/Sentry, which most host apps already run. Writing with pre-allocated buffers avoids allocation inside a signal handler — the classic way crash reporters become the crash.
- **Alternatives**: Replacing the host's handler (breaks their crash reporting — unacceptable in an SDK); catching at the top of `main` (misses signals); a full crash-reporting framework (out of scope; we need the log window, not symbolication).
- **Boundary**: Swift runtime traps (`fatalError`, force-unwrap nil) surface as `SIGTRAP`/`SIGILL` and are captured as signals without a Swift-level stack trace on all supported OS versions. Documented, matched against Android's equivalent limits.

## R14 — User-action capture and attribution *(new; the load-bearing v3 mechanism)*

- **Decision**: Capture at the **window event-dispatch boundary**:
  - **iOS**: swizzle `UIWindow.sendEvent(_:)`. Every touch in the app passes through it.
  - **Android**: wrap each Activity's `Window.Callback` (`dispatchTouchEvent`) via `Application.ActivityLifecycleCallbacks`.

  Gesture classification (tap / long press / swipe+direction / scroll / text input) is derived from the touch sequence. Label derivation follows FR-039i's order: accessibility label → visible text → view/resource identifier → positional fallback, obtained by hit-testing the touch point.

  **Attribution** uses a "current action" set at action time with a short causality window; a request or log line is attributed to the action current **at the moment the record starts** (FR-039a), not when it completes. Records arriving outside any action's window go to `Unattributed` (FR-039c).
- **Rationale**: `UIWindow.sendEvent` is **the only layer that sees SwiftUI and UIKit touches identically** — SwiftUI renders into a UIKit hosting view, so its touches traverse the same window dispatch. This is what makes FR-049's dual-host parity achievable with one implementation rather than two, and it is why R17's overlay decision and this one reinforce each other.
  - Attributing at record *start* rather than record *completion* is what makes SC-010's 95% target reachable when several actions fire faster than their responses return (an explicit spec edge case).
- **Alternatives**: Accessibility-service / `UIAccessibility` observation (Android's requires a user-granted accessibility service — unacceptable for an embedded SDK); host-app instrumentation (**forbidden by FR-039f**); method-swizzling individual `UIControl`/`View.OnClickListener` targets (misses SwiftUI entirely, and misses gestures).
- **Privacy**: FR-039g — text-input actions record only that input occurred; secure/password fields are detected (`isSecureTextEntry` / `inputType` password flags) and their content is never read.

## R15 — Screenshot capture *(resolves Constitution Delta D2)*

- **Decision**:
  - **iOS**: `UIGraphicsImageRenderer` + `drawHierarchy(in:afterScreenUpdates:)` over the host's windows, **skipping the SDK's own overlay window** (R17). Works at iOS 13.
  - **Android**: `View.draw(Canvas)` over the Activity's decor view as the **primary** path (API 23-compatible), with `PixelCopy` as an **enhancement on API 24+** where it correctly captures `SurfaceView`/`TextureView` content.
- **Rationale**: The obvious Android API, `PixelCopy`, is API 24+ — one above our floor. Making it primary would have broken FR-050a at API 23. `View.draw` is the compatible path; `PixelCopy` upgrades fidelity where available.
- **Parity consequence**: `SurfaceView`/video content renders blank under `View.draw`, and iOS has an equivalent limit for `AVPlayerLayer`/DRM content. These are documented as a **matched** coverage boundary (Principle II) rather than a per-platform surprise.
- **Alternatives**: `MediaProjection` for stills (heavyweight permission prompt for a screenshot); private screenshot APIs (App Store rejection).

## R16 — Bug-attached media transfer

- **Decision**: Three-hop, resumable, chunked: device → desktop over the existing WebSocket (binary frames, chunked with offsets so an interrupted transfer resumes rather than restarts) → desktop stages it in SQLite/filesystem → desktop uploads to backend object storage via a `core/media.go`-issued pre-signed URL, then confirms the reference to the relational record. Capture state machine: `device-only` → `pending` → `stored`.
- **Rationale**: Implements FR-044/044a/044b and the "interrupted transfer must not produce a truncated file that presents as complete" edge case. The device never talks to the backend directly (FR-044a) — it only ever needs to reach the desktop, preserving Principle III. Metadata syncs on the record outbox; the binary rides the media outbox (R9).
- **Alternatives**: Device uploads directly to backend (violates FR-044a and assumes device→internet connectivity a lab device may not have); base64 inside the JSON record (bloats the record path ~33% and reintroduces the coupling FR-044b forbids); storing binaries as Postgres `bytea` (bloats the relational store, complicates backup, no pre-signed access).

## R17 — iOS dual-host integration (SwiftUI + UIKit)

- **Decision**: **One shared Swift core, two thin entry points, and the overlay in its own `UIWindow`** at `.normal + 1` level:
  - UIKit host: `QASDK.start(config:)` from `application(_:didFinishLaunchingWithOptions:)`.
  - SwiftUI host: `.qaSDK(config:)` scene/view modifier, or the same `QASDK.start` from an `App` initialiser.
  - The overlay window is created and managed entirely by the SDK.
- **Rationale**: A separate `UIWindow` is the single decision that satisfies three requirements at once — FR-049b (renders above host content without the host relayouting, wrapping its root view, or subclassing SDK types), FR-046 (trivially excluded from screenshots: it is simply not in the enumerated host windows), and FR-049/049a parity (identical presentation regardless of host UI framework, because a window sits above both). Any in-hierarchy approach would have required host cooperation, and per-host special-casing for capture exclusion.
- **Alternatives**: Injecting a `UIHostingController` into the host's hierarchy (needs host cooperation — violates FR-049b; makes capture exclusion host-specific); separate SwiftUI and UIKit overlay implementations (doubles the surface and guarantees drift against Principle II).
- **Android equivalent**: a `WindowManager`-added overlay view outside the Activity's decor view — same self-exclusion property under R15's `View.draw(decorView)`.

## R18 — Contract versioning & capability negotiation

- **Decision**: Each of the three contracts carries an independent semver. The WS `hello`/`paired` handshake and the sync API's `X-Contract-Version` header exchange versions and a capability list. Same major → connect; newer minor may add fields/messages an older peer ignores; major mismatch → refuse with a message naming which peer is out of date. Unknown fields and unknown message types are ignored, never errors.
- **Rationale**: Implements FR-000c/d/e and is what makes the four-project split actually independent (FR-000, SC-018/019/020) — without it, "independently releasable" is aspirational. The explicit capability list is what lets the desktop honour FR-050b: show a feature as unavailable-because-out-of-date rather than hiding it or appearing to work.
- **Alternatives**: Strict lockstep versions (forces coordinated four-project releases — defeats the split); best-effort silent degradation (explicitly rejected during `/speckit-clarify`, and forbidden by FR-000e).
- **Note**: FR-050c makes raising either SDK's minimum OS a **major** bump, since it can strand a host app that cannot upgrade. That is a release-policy consequence, not a runtime one, and belongs in each SDK's release checklist.

## R19 — Google SSO from a Tauri desktop app *(new)*

- **Decision**: **Authorization Code + PKCE, in the user's system browser, with a loopback redirect.** The desktop binds an ephemeral listener on `127.0.0.1:0`, opens the Google authorize URL in the default browser with `code_challenge` (S256), `state`, and `nonce`, receives the code on `http://127.0.0.1:<port>/callback`, and exchanges it for an ID token **as a public client with no secret**. The ID token goes to the backend (`POST /v1/auth/google`), which verifies it independently and mints its own session.
- **Rationale**: Three constraints force this shape, and all three are load-bearing:
  1. **Google blocks OAuth in embedded webviews** (`disallowed_useragent`). A Tauri app cannot open its own window for sign-in — this is the single most common way desktop Google SSO is built wrong, and it fails at runtime in production, not at build time.
  2. **A native app cannot hold a client secret.** Anything shipped to a user's machine is public, so the client is registered as a Desktop/native client and PKCE replaces the secret as proof-of-possession.
  3. **The OOB flow (`urn:ietf:wg:oauth:2.0:oob`) is retired.** Loopback is the remaining supported redirect for native apps.
- **Hardening (normative, not optional)**: bind the listener to `127.0.0.1` explicitly — **never `0.0.0.0`**, which would expose the callback to the local network; verify `state` before accepting the code; bind `nonce` through to the backend's ID-token check so a token minted for another request cannot be replayed; shut the listener down immediately after the callback.
- **Backend verification (FR-051b)**: fetch and cache Google's JWKS, verify signature, `iss ∈ {accounts.google.com, https://accounts.google.com}`, `aud` = our client ID, `exp`/`iat`, and `nonce`. The backend must **never** accept an assertion just because the desktop sent it — the desktop is not a trusted component; it runs on a user's machine.
- **Identity keying**: link on the `sub` claim, never `email`. Google emails change and can be reassigned within a Workspace domain; keying on email silently merges two people or splits one (data-model, SC-024).
- **Alternatives**: embedded webview (blocked by Google, and would let the app observe the user's Google credentials — unacceptable regardless); device-code flow (designed for input-constrained devices; needless friction on a desktop with a browser); desktop-holds-a-secret confidential client (secret is extractable from any shipped binary); backend-side OAuth with the desktop polling (extra moving parts for no gain when a loopback listener is available).

## R20 — Session caching & offline grace *(new; protects Principle III)*

- **Decision**: The backend mints an opaque session credential (stored hashed) plus a refresh credential. The desktop caches the credential **and a snapshot of the user's workspace memberships** in its OS keychain/credential store, with `offline_grace_until = issued_at + 30 days` (configurable). Within grace the desktop performs **no** auth network calls; it starts sessions, captures, and raises bugs entirely on cached state. Beyond grace, re-authentication gates only the start of a *new* Test Session — never a running one, never reading local data.
- **Rationale**: This is the design that keeps FR-053 and Principle III from contradicting each other. Authentication is the first hard backend dependency in the product; without a grace window, a flaky network or an offline test lab turns "degraded sync" into "cannot test at all", breaking SC-005 and SC-022. Caching *memberships* alongside the credential matters as much as caching the credential — an offline desktop must still be able to scope data to the active workspace.
- **Accepted trade-off, stated plainly**: revocation is not instantaneous. A user removed from a workspace keeps working offline until grace expires. Mitigation is at the sync boundary — the backend rejects that workspace's records the moment connectivity returns, and the desktop must **surface the rejection** rather than silently dropping queued records. Making revocation instant would require an online check per operation, which is precisely what Principle III forbids.
- **Alternatives**: short-lived tokens with mandatory online refresh (breaks offline testing); no expiry at all (a stolen laptop is a permanent breach); storing the credential in plain config (trivially exfiltrated — OS keychain is the minimum bar).

## R21 — Multi-workspace scoping *(new)*

- **Decision**: `User` becomes global; `WorkspaceMembership(user_id, workspace_id, role, status)` is the only path to a workspace. The desktop tracks an **active workspace** as local UI state; every query is scoped to it. The backend derives the permitted workspace set from membership **on every request** and refuses anything outside it, regardless of what the client asked for. Records (Device, Test Session, Bug, Screen Capture) are permanently bound to the workspace they were created in; switching the active workspace is refused while a session is running.
- **Rationale**: The prior `User.workspace_id` FK made multi-workspace structurally impossible. Deriving authorization from membership server-side — rather than trusting a client-supplied `workspace_id` — is the difference between a scoping *convention* and a scoping *control*; a client that simply asks for a different workspace's ID is the first thing anyone tries (SC-023).
  - Refusing a workspace switch mid-session (FR-056d) rather than handling it cleverly is deliberate: the alternatives are reassigning a running session's data to a workspace it wasn't captured in, or orphaning it. Both corrupt attribution; a refusal with a clear reason costs one dialog.
- **Alternatives**: workspace as a request header trusted by the backend (no better than the client asserting its own permissions); one desktop install per workspace (defeats the purpose); silently ending the session on switch (data loss the user didn't ask for).

---

## Resolved unknowns

All Technical Context items are decided above; no `NEEDS CLARIFICATION` remain.

**EX-001 (screen recording) is deliberately NOT resolved here.** It is scoped as a spike in the spec, not a plan decision. Research notes for whoever runs it: iOS `RPScreenRecorder.startCapture` (iOS 11+, so the floor is fine) delivers sample buffers the SDK must encode itself, and overlay exclusion is materially harder than for a still because the overlay window is composited into the capture; Android `MediaProjection` (API 21+) requires a per-session user consent dialog and shows a persistent system indicator. Neither is blocked by the OS floors — the open questions are permission UX, overlay exclusion in a live stream, and transfer cost. `/speckit-tasks` must **not** generate implementation tasks for recording, only the spike.
