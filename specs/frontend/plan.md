# Implementation Plan: Frontend — Desktop App (Tauri)

**Project**: 1 of 4 — Desktop application | **Date**: 2026-07-29 | **Spec**: [spec.md](spec.md)

**Scope**: This is the desktop-scoped view of the umbrella plan ([../001-test-management-platform/plan.md](../001-test-management-platform/plan.md)). It carries only what the desktop team needs to build the Tauri app standalone (FR-000, SC-018). Where this file and the umbrella disagree, the umbrella wins.

## Summary

The desktop (Tauri) is the QA team's workstation and the hub of the product: **test authoring, the live session runner, the action-grouped log inspector, bug capture, and reporting**. It **hosts the LAN WebSocket server** that mobile devices dial into (desktop-as-server), **owns a durable local SQLite store** so sessions survive backend outages, and runs **two sync outboxes to the backend** — one for durable records, a separate one for bug-attached media.

The hot path — device → desktop over local WebSocket — never touches the backend. General API logs, app logs, and user actions are device-local, streamed, and clearable; the desktop renders and groups them but never persists them durably or syncs them. Bugs and their evidence are local-first and sync to the backend; bug-attached media travels device → desktop → backend object storage as a **separate, resumable** transfer so a large video never blocks a bug record from syncing.

Authentication is the product's single connectivity-dependent moment. The desktop signs in via **Google SSO in the system browser** (Authorization Code + PKCE, loopback redirect, no client secret), caches the backend-minted session plus a membership snapshot in the OS keychain, and then operates for a **30-day offline grace** window with no auth network calls at all — the mechanism that keeps auth from breaking local-first resilience.

## Technical Context

**Language/Version**: Rust (stable, Tauri 2.x) for the core + TypeScript 5.x / React 18 for the webview UI.

**Primary Dependencies**:

- Tauri 2.x, React + Vite (webview UI stack — R1).
- `tokio-tungstenite` — the LAN WebSocket **server** (R3).
- `rusqlite` — the local-first SQLite store (R2).
- Desktop auth — the user's **system browser** + an ephemeral `127.0.0.1` loopback listener (Authorization Code + PKCE, **no client secret**); the backend-minted session credential is stored in the **OS keychain** (R19/R20).

**Storage**: SQLite (local-first durable store: sessions, results, bugs, evidence, device registrations, the record outbox, and media staging). See [data-model.md](data-model.md).

**Testing**: `cargo test` (Rust core) + Vitest (webview UI) — contract-first, failing tests before implementation (R11, Principle IV).

**Target Platform**: macOS 12+, Windows 10+, Linux.

**Performance Goals**: A live event visible in the desktop viewer within ~2s including its in-progress state (SC-003); the log viewer smooth at 50 events/sec with 10k+ events retained via virtualization (R10).

**Constraints**: `allowlist` device policy by default; pairing token single-use + 5-min TTL; ≥2 concurrent, isolated device sessions; zero in-session data loss during a backend outage (SC-005); no active-workspace switch while a session is running (FR-056d).

**Project Type**: One of four independent projects integrating over versioned contracts. The desktop honours two contracts — `device-desktop-ws` (**server**) and `sync-api` (**client**).

## Project Structure

The desktop builds, tests, and releases on its own (FR-000, SC-018) — no shared build graph, no cross-project source imports. The `desktop/` subtree, copied verbatim from the umbrella plan:

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
```

**Structure Decision**: The Rust core owns the network + storage surface (WS server, SQLite, pairing, auth, sync, defensive redaction, action assembly); the React/TS webview owns the UI features. This split keeps the privacy/durability logic in the typed, testable core and off the webview.

## Key design decisions

1. **LAN WebSocket server (desktop-as-server), `tokio-tungstenite` (R3).** Devices dial a QR-encoded `ws_url` — no manual IP entry (FR-016). One desktop accepts multiple concurrent device connections, each mapped to its own isolated session (FR-021). The alternative (device-as-server) would force the desktop to discover/scan devices — worse UX and worse offline behaviour.

2. **Two outboxes: record + media (R9, R16).** The desktop writes bugs/sessions/results to SQLite first, then a background **record outbox** pushes them with idempotency keys. A **second, independent media outbox** transfers bug-attached binaries. Two outboxes rather than one because FR-044b requires a Bug record to sync independently of its media — a 5-minute video must never hold up a 2 KB bug record. This is one of the two structural costs recorded in Complexity Tracking.

3. **Google SSO via system browser + PKCE loopback (R19).** Authorization Code + PKCE in the default browser, code returned on `http://127.0.0.1:<port>/callback`, exchanged as a public client with **no secret**; the resulting Google ID token goes to the backend, which independently verifies it and mints its own session. Google **blocks** embedded webviews (`disallowed_useragent`), a native app cannot hold a secret, and OOB is retired — so loopback PKCE is the only correct shape. Hardening is normative: bind `127.0.0.1` explicitly (never `0.0.0.0`), verify `state`, bind `nonce` through to the backend, shut the listener down right after the callback.

4. **Offline grace cache (R20).** The desktop caches the backend-minted session credential **and a snapshot of the user's workspace memberships** in the OS keychain, with `offline_grace_until = issued_at + 30 days`. Within grace it performs **no** auth network calls; beyond grace, re-auth gates only the start of a *new* Test Session — never a running one, never reading local data (FR-053a). Caching memberships matters as much as caching the credential: an offline desktop must still scope data to the active workspace.

5. **Active-workspace switching (R21).** The desktop tracks an **active workspace** as local UI state and scopes every query to it. Records (Device, Test Session, Bug, Screen Capture) are permanently bound to the workspace they were created in; a workspace switch is **refused while a session is running** (FR-056d) rather than reassigning or orphaning that session's data. The backend remains the authority — it derives permitted workspaces from membership on every request and refuses anything outside them.

## Constitution & Complexity notes (desktop-relevant)

- **Principle III — Local-First Resilience (delta D3).** The device→desktop path is backend-independent and the desktop SQLite store is durable. Bugs queue in the record outbox; media queues separately (FR-044a) so an offline backend degrades evidence *visibility*, never the session or the bug record. **Auth is the one hard backend dependency**, neutralised by the cached session + 30-day offline grace (R20). *Accepted cost, recorded not buried*: revocation is not instantaneous — a user removed from a workspace keeps working offline until grace lapses; the backend rejects that workspace's records on reconnect and the desktop must **surface the rejection** rather than silently dropping the queue.

- **Complexity Tracking — separate media transfer path.** Carrying media in the record outbox would let a 5-minute video block a 2 KB bug record, breaking SC-005's "no loss, no blocking" expectation during flaky connectivity. FR-044b requires the Bug record to sync independently of a possibly-large binary, so the desktop runs the media outbox alongside the record outbox despite the extra machinery.

- **Principle I — defensive redaction only.** The desktop re-scans incoming frames for unredacted sensitive keys but **never** treats that as the gate; redaction at source (the SDKs) and the backend's 422 are the real gates (R7).

## Phase Status

- [x] Phase 0 — research.md (desktop decisions: R1–R4, R7, R9–R11, R16, R18–R21)
- [x] Phase 1 — data-model.md (desktop SQLite store), contracts/ (device-desktop-ws server side, sync-api client side), quickstart.md
- [x] Constitution re-check post-design — PASS; D3 resolved via cached session + offline grace (R20)
- [ ] Phase 2 — tasks.md (`/speckit-tasks` — NOT created here)
