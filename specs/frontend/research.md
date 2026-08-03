# Phase 0 Research (Desktop): QA Test Management Platform (v3)

The desktop-relevant subset of the umbrella research ([../001-test-management-platform/research.md](../001-test-management-platform/research.md)). Each entry: Decision / Rationale / Alternatives. R-numbers are preserved from the umbrella for traceability; the umbrella holds the full form of every decision, and where a decision is cross-cutting (spans the SDKs or the backend) only its desktop-facing side is reproduced here, with a note pointing back.

The spec's `## Technical Constraints` (TC-001..TC-005a) are **fixed inputs**, not open questions — research fills the gaps around them.

---

## R1 — Desktop webview UI stack

- **Decision**: React 18 + TypeScript + Vite inside Tauri 2.x.
- **Rationale**: The design-canvas mockups in `QATools.zip` are authored in `.jsx`, so React is the lowest-friction path to the intended UI. Vite is Tauri's default. TypeScript carries the protocol types.
- **Alternatives**: Svelte/SolidJS (discards existing mockups); native Rust GUI (far more effort for a data-dense CRUD + log UI).

## R2 — Desktop local persistence

- **Decision**: SQLite via `rusqlite` in the Tauri Rust core.
- **Rationale**: Principle III needs a durable local store so sessions and bugs survive backend outages. Embedded, transactional, zero-ops; structured queries back the reporting views (FR-033/034).
- **Alternatives**: Flat JSON (no transactions, poor for reporting); embedded Postgres (heavyweight); Tauri Store plugin (key-value only).

## R3 — Device↔desktop transport & topology *(desktop-as-server side)*

- **Decision**: Desktop hosts a LAN WebSocket server (`tokio-tungstenite`); each SDK is a client. One desktop accepts multiple concurrent device connections, each mapped to its own session.
- **Rationale**: Spec mandates WebSocket, real-time in-progress streaming (FR-025), backend-independent operation (FR-035), and ≥2 concurrent isolated sessions (FR-021). Desktop-as-server means devices dial a QR-encoded address — no manual IP entry (FR-016).
- **Alternatives**: Device-as-server (desktop must discover/scan — worse UX); routing through the backend (violates Principle III, adds latency, fails offline).
- **Cross-cutting note**: the SDK-client side of this decision (reconnect, bounded backlog) lives in the umbrella and the two SDK folders; the wire protocol is `contracts/device-desktop-ws.md`.

## R4 — Pairing mechanism *(desktop mints token + QR)*

- **Decision**: Desktop mints a single-use token (5-min TTL) and renders a QR encoding `{ws_url, token, contract_version}`; a short numeric code is the manual fallback. On connect the SDK presents the token; the desktop validates once, binds the device to a registration, then issues a longer-lived per-device reconnect credential.
- **Rationale**: Implements FR-016/020/020a and the "device ID ≠ authentication" edge case. Single-use + TTL closes the replay window; the reconnect credential enables automatic re-pairing (US2 scenario 7) without re-scanning.
- **Alternatives**: Static shared secret (replayable); mDNS auto-trust (no human-in-the-loop authorization).

## R7 — Redaction strategy *(desktop defensive re-scan — never the primary gate)*

- **Decision**: One declarative redaction spec applied identically in both SDKs at capture time: case-insensitive key match on headers and on structured (JSON / form-urlencoded) body fields for `Authorization`, `Cookie`, `token`, `password`, `apiKey`; matched values replaced with `«redacted»`. Extended in v3 to app-log message bodies (FR-037b). **The desktop (and the backend) re-scan defensively but never rely on it** — the desktop must never trust the wire.
- **Rationale**: Redaction at source is the constitution's hard gate. A shared data-driven spec is what makes iOS/Android parity testable rather than two drifting implementations; the desktop's re-scan is a backup, not the gate.
- **Alternatives**: Redact only on the desktop (violates Principle I — raw data already left the device); regex-over-raw-bytes (misses structure, high false-negative rate on nested JSON).
- **Cross-cutting note**: the authoritative redaction spec and the SDK capture-time implementation live in the umbrella and the SDK folders; the backend's independent 422 gate lives in the backend folder.

## R9 — Sync & durability model *(record + media outboxes, idempotency keys)*

- **Decision**: Desktop writes bugs/sessions/results to SQLite first, then a background **record outbox** pushes them with idempotency keys. **A second, independent media outbox** transfers bug-attached binaries (FR-044a/b). De-duplication uses stable `event_id`/`request_id`; the backend's `sync.go` returns `duplicate` for replays and `409` for genuinely conflicting concurrent updates.
- **Rationale**: Implements FR-035a/b and the "exactly one entry per unique event" edge case. Two outboxes rather than one because FR-044b explicitly requires a Bug record to sync independently of its media — a 5-minute video must never hold up a 2 KB bug record.
- **Alternatives**: Synchronous write-through (breaks under outage — violates Principle III); one combined outbox (violates FR-044b); CRDTs (overkill for single-writer-per-record MVP data).

## R10 — Log viewer performance under high volume *(grouped virtualization)*

- **Decision**: Virtualized list with a capped in-memory ring buffer per session and coalesced render updates; older events spill to SQLite and page back on scroll. **Grouped mode virtualizes at the group level**, with lazy expansion of each group's records.
- **Rationale**: SC-003 and the high-volume edge case require the viewer to stay responsive without dropping the UI. Target: smooth at 50 events/sec with 10k+ events retained.
- **Alternatives**: Render-all (freezes under load); drop-on-overflow without persistence (loses evidence a bug marker may need).

## R11 — Testing approach (TDD, Principle IV) *(cargo test + Vitest)*

- **Decision**: Contract-first. `contracts/` + `data-model.md` produce failing tests before implementation. For the desktop that is **`cargo test`** (Rust core) **+ Vitest** (webview UI).
- **Rationale**: TDD is non-negotiable. The desktop's tests target the WS-server gate/handshake, pairing-token single-use + TTL, outbox idempotency/de-dup, action-group assembly, and the reporting queries — each traced to FR/SC IDs.
- **Alternatives**: Per-project bespoke tests with no contract fixtures (integration drifts undetected); manual QA of redaction re-scan (unacceptable for a security-adjacent path).
- **Cross-cutting note**: the shared `conformance/` suite (byte-identical redacted frames across the two SDKs) lives in the umbrella; the desktop consumes the same wire fixtures to assert it ignores unknown fields (FR-000d) and refuses a major mismatch (FR-000c).

## R16 — Bug-attached media transfer *(desktop stages + uploads via pre-signed URL)*

- **Decision**: Three-hop, resumable, chunked: device → desktop over the existing WebSocket (binary frames, chunked with offsets so an interrupted transfer resumes rather than restarts) → **desktop stages it in SQLite/filesystem** → **desktop uploads to backend object storage via a `core/media.go`-issued pre-signed URL**, then confirms the reference to the relational record. Capture state machine: `device-only` → `pending` → `stored`.
- **Rationale**: Implements FR-044/044a/044b and the "interrupted transfer must not produce a truncated file that presents as complete" edge case. The device never talks to the backend directly (FR-044a) — it only ever needs to reach the desktop, preserving Principle III. Metadata syncs on the record outbox; the binary rides the media outbox (R9). The desktop marks a capture complete only after the full-object checksum verifies.
- **Alternatives**: Device uploads directly to backend (violates FR-044a and assumes device→internet connectivity a lab device may not have); base64 inside the JSON record (bloats the record path ~33% and reintroduces the coupling FR-044b forbids); storing binaries as Postgres `bytea` (bloats the relational store, complicates backup, no pre-signed access).

## R18 — Contract versioning & capability negotiation *(handshake, desktop side)*

- **Decision**: Each of the three contracts carries an independent semver. The WS `hello`/`paired` handshake and the sync API's `X-Contract-Version` header exchange versions and a capability list. Same major → connect; newer minor may add fields/messages an older peer ignores; major mismatch → refuse with a message naming which peer is out of date. Unknown fields and unknown message types are ignored, never errors.
- **Rationale**: Implements FR-000c/d/e and is what makes the four-project split actually independent (FR-000, SC-018/019/020). The explicit capability list is what lets the desktop honour FR-050b: show a feature as unavailable-because-out-of-date rather than hiding it or appearing to work. For the desktop specifically, this means recording each device's `sdk_contract_version` + `sdk_capabilities` at handshake and rendering out-of-date capabilities as *unavailable-for-this-device with a reason*.
- **Alternatives**: Strict lockstep versions (forces coordinated four-project releases — defeats the split); best-effort silent degradation (explicitly rejected during `/speckit-clarify`, and forbidden by FR-000e).
- **Note**: FR-050c makes raising either SDK's minimum OS a **major** bump — a release-policy consequence, not a desktop-runtime one.

## R19 — Google SSO from a Tauri desktop app *(PKCE loopback, hardening)*

- **Decision**: **Authorization Code + PKCE, in the user's system browser, with a loopback redirect.** The desktop binds an ephemeral listener on `127.0.0.1:0`, opens the Google authorize URL in the default browser with `code_challenge` (S256), `state`, and `nonce`, receives the code on `http://127.0.0.1:<port>/callback`, and exchanges it for an ID token **as a public client with no secret**. The ID token goes to the backend (`POST /v1/auth/google`), which verifies it independently and mints its own session.
- **Rationale**: Three constraints force this shape, and all three are load-bearing:
  1. **Google blocks OAuth in embedded webviews** (`disallowed_useragent`). A Tauri app cannot open its own window for sign-in — this is the single most common way desktop Google SSO is built wrong, and it fails at runtime in production, not at build time.
  2. **A native app cannot hold a client secret.** Anything shipped to a user's machine is public, so the client is registered as a Desktop/native client and PKCE replaces the secret as proof-of-possession.
  3. **The OOB flow (`urn:ietf:wg:oauth:2.0:oob`) is retired.** Loopback is the remaining supported redirect for native apps.
- **Hardening (normative, not optional)**: bind the listener to `127.0.0.1` explicitly — **never `0.0.0.0`**, which would expose the callback to the local network; verify `state` before accepting the code; bind `nonce` through to the backend's ID-token check so a token minted for another request cannot be replayed; shut the listener down immediately after the callback.
- **Identity keying**: link on the `sub` claim, never `email`. Google emails change and can be reassigned within a Workspace domain; keying on email silently merges two people or splits one (data-model, SC-024).
- **Alternatives**: embedded webview (blocked by Google, and would let the app observe the user's Google credentials — unacceptable regardless); device-code flow (needless friction on a desktop with a browser); desktop-holds-a-secret confidential client (secret is extractable from any shipped binary); backend-side OAuth with the desktop polling (extra moving parts for no gain when a loopback listener is available).
- **Cross-cutting note**: the backend's independent ID-token verification (JWKS, `iss`/`aud`/`exp`/`nonce`) is FR-051b and lives in the backend folder — the desktop is **not** a trusted component and must never expect the backend to accept an assertion just because the desktop sent it.

## R20 — Session caching & offline grace *(protects Principle III)*

- **Decision**: The backend mints an opaque session credential (stored hashed) plus a refresh credential. The desktop caches the credential **and a snapshot of the user's workspace memberships** in its OS keychain/credential store, with `offline_grace_until = issued_at + 30 days` (configurable). Within grace the desktop performs **no** auth network calls; it starts sessions, captures, and raises bugs entirely on cached state. Beyond grace, re-authentication gates only the start of a *new* Test Session — never a running one, never reading local data.
- **Rationale**: This is the design that keeps FR-053 and Principle III from contradicting each other. Authentication is the first hard backend dependency in the product; without a grace window, a flaky network or an offline test lab turns "degraded sync" into "cannot test at all", breaking SC-005 and SC-022. Caching *memberships* alongside the credential matters as much as caching the credential — an offline desktop must still scope data to the active workspace.
- **Accepted trade-off, stated plainly**: revocation is not instantaneous. A user removed from a workspace keeps working offline until grace expires. Mitigation is at the sync boundary — the backend rejects that workspace's records the moment connectivity returns, and the desktop must **surface the rejection** rather than silently dropping queued records. Making revocation instant would require an online check per operation, which is precisely what Principle III forbids.
- **Alternatives**: short-lived tokens with mandatory online refresh (breaks offline testing); no expiry at all (a stolen laptop is a permanent breach); storing the credential in plain config (trivially exfiltrated — OS keychain is the minimum bar).

## R21 — Multi-workspace scoping *(active workspace, refuse switch mid-session)*

- **Decision**: `User` becomes global; `WorkspaceMembership(user_id, workspace_id, role, status)` is the only path to a workspace. The desktop tracks an **active workspace** as local UI state; every query is scoped to it. The backend derives the permitted workspace set from membership **on every request** and refuses anything outside it, regardless of what the client asked for. Records (Device, Test Session, Bug, Screen Capture) are permanently bound to the workspace they were created in; switching the active workspace is **refused while a session is running**.
- **Rationale**: The prior `User.workspace_id` FK made multi-workspace structurally impossible. Deriving authorization from membership server-side — rather than trusting a client-supplied `workspace_id` — is the difference between a scoping *convention* and a scoping *control*; a client that simply asks for a different workspace's ID is the first thing anyone tries (SC-023).
  - Refusing a workspace switch mid-session (FR-056d) rather than handling it cleverly is deliberate: the alternatives are reassigning a running session's data to a workspace it wasn't captured in, or orphaning it. Both corrupt attribution; a refusal with a clear reason costs one dialog.
- **Alternatives**: workspace as a request header trusted by the backend (no better than the client asserting its own permissions); one desktop install per workspace (defeats the purpose); silently ending the session on switch (data loss the user didn't ask for).

---

## Resolved unknowns

All desktop Technical Context items are decided above; no `NEEDS CLARIFICATION` remain.

**EX-001 (screen recording) is deliberately NOT resolved here** — it is scoped as a spike in the spec, not a plan decision. If recording never ships, the SDKs expose no recording control and the desktop shows no recording affordance (FR-050b: no inert affordances); the desktop's `Screen Capture` model already carries a `type='recording'` shape so that shipping the spike later is a data change, not a schema rewrite. Full spike notes live in the umbrella research.
