# Contract: Desktop ↔ Backend REST Sync API

**Contract version: `1.0.0`** (semver per FR-000c/d — see Versioning below).

Thin REST API over a Go backend. The desktop is the sole client; **mobile devices never call this API** (FR-044a). The backend persists durable records, stores bug-attached media, and serves cross-device history/reporting. **No API Log Events, App Log Events, or User Actions are ever sent here** — they are ephemeral and device-local.

Base path: `/v1`. Bodies JSON (except media upload). All writes are idempotent via `Idempotency-Key`.

## Route groups → Go handler files

Each group below is exactly one `api/handlers_*.go` file (TC-001, architecture diagram). Handlers **never touch the database** — they decode, call a `core` service method, and encode. `core/internal/store` is unreachable from the `api` module by Go's `internal` rule, so this is compiler-enforced, not conventional.

| Route group | Handler file | Core service |
|---|---|---|
| Auth + identity | `handlers_auth.go` | `core.Auth` (`auth.go`) |
| Workspaces + membership | `handlers_workspaces.go` | `core.Workspaces` |
| Sync batch + changes | `handlers_sync.go` | `core.Sync` (`sync.go`) |
| Bugs + evidence | `handlers_bugs.go` | `core.Bugs` |
| Sessions + results | `handlers_sessions.go` | `core.Sessions` |
| Test cases | `handlers_testcases.go` | `core.TestCases` |
| Test plans + items | `handlers_testplans.go` | `core.TestPlans` |
| Devices | `handlers_devices.go` | `core.Devices` |
| Reports | `handlers_reports.go` | `core.Reports` |
| Media | `handlers_media.go` | `core.Media` |

## Principles enforced here

- Only durable entities sync: Workspace, User, Test Case, Tag, Test Plan, Test Plan Item, Device, Test Session, Session Case Result, Bug, Evidence, and **Screen Capture metadata + binary when attached to a Bug**.
- `core/redaction` re-scans incoming bodies for unredacted sensitive keys and rejects with `422` — a defensive gate, never the real one (Principle I).
- `core/sync.go` de-duplicates replays and returns `409` on genuinely conflicting concurrent updates.
- **Availability of this API is never required for a live session** (Principle III). A `503` is a non-event for the user.

## Endpoints

### Auth & identity *(new — FR-051…056)*
| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/v1/auth/google` | Exchange a Google ID token for a session. Body: `id_token`, `nonce`. Backend verifies signature/`iss`/`aud`/`exp`/`nonce` against Google's JWKS **before** minting anything (FR-051b) |
| `POST` | `/v1/auth/refresh` | Renew a session with a refresh credential |
| `POST` | `/v1/auth/logout` | Revoke the current session server-side (FR-054) |
| `GET`  | `/v1/me` | Current user + **all** workspace memberships — the desktop caches this for offline operation (FR-052a) |
| `GET`  | `/v1/workspaces` | Workspaces the caller is an active member of |

`POST /v1/auth/google` response:
```json
{ "session_token": "opaque", "refresh_token": "opaque",
  "expires_at": "ISO-8601", "offline_grace_until": "ISO-8601",
  "user": { "id": "uuid", "display_name": "…", "email": "…" },
  "memberships": [ { "workspace_id": "uuid", "name": "…", "role": "admin", "status": "active" } ] }
```

> The desktop obtains the `id_token` itself via Authorization Code + PKCE in the **system browser** with a loopback redirect (FR-051a, research R19) — not an embedded webview, which Google rejects outright. Google tokens are **never** used as the system's session credential and are never forwarded anywhere (FR-052).

### Authentication & workspace scoping (applies to every endpoint below)

- Every request carries `Authorization: Bearer <session_token>`. Missing/invalid/expired → **`401`**.
- The backend derives the caller's permitted workspaces from **Workspace Membership on every request**. A request naming a workspace the caller is not an active member of → **`403`**, whether or not the desktop thinks it should have access (FR-056b, SC-023).
- A client-supplied `workspace_id` is a **filter, never an authorization**. This is the boundary attacked first: swapping in another workspace's UUID must fail server-side, not merely be absent from the UI.

### Push (desktop → backend)
| Method | Path | Purpose | Notes |
|--------|------|---------|-------|
| `POST` | `/v1/sync/batch` | Push a batch of created/updated durable records | Idempotent; per-record partial-success report |
| `POST` | `/v1/bugs` | Create/update a Bug + Evidence | Sets `synced_at`; FR-035b |
| `PUT`  | `/v1/sessions/{id}` | Upsert a session + its case results | FR-012/014 |
| `PUT`  | `/v1/test-cases/{id}` | Upsert a test case (soft-delete via `deleted_at`) | FR-006 |
| `PUT`  | `/v1/test-plans/{id}` | Upsert a plan + items | FR-009/010 |
| `PUT`  | `/v1/devices/{id}` | Upsert device registration, enabled state, SDK version + capabilities | FR-018/019, FR-000e |

### Media *(new in v3 — FR-044)*
| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/v1/media/upload-url` | Request a pre-signed upload URL for a bug-attached capture. Body: `capture_id`, `bug_id`, `content_type`, `byte_size` |
| `POST` | `/v1/media/{capture_id}/confirm` | Confirm a completed upload; backend verifies the stored object's size/checksum and only then links `remote_ref` to the Evidence row |

> The desktop uploads bytes directly to object storage via the pre-signed URL — not through the API. Confirm-after-verify is what prevents a truncated transfer from presenting as complete evidence (spec edge case); until `confirm` succeeds the capture stays `pending`, and the Bug displays evidence-in-transit rather than none (FR-044a).

### Pull (backend → desktop)
| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/v1/sync/changes?since={cursor}` | Delta of durable records changed since cursor |
| `GET` | `/v1/reports/pass-fail-by-plan` | Pass/fail rate per plan (FR-033) |
| `GET` | `/v1/reports/failed-cases-by-build` | Failed cases by build (FR-033) |
| `GET` | `/v1/reports/bugs-by-environment` | Bug counts per environment (FR-033) |

> Reporting endpoints are also computable locally from desktop SQLite when offline; the backend versions serve cross-device aggregation. Figures MUST match underlying data exactly (SC-007).

## Versioning & capability negotiation *(new in v3 — FR-000c/d/e)*

- Every request sends `X-Contract-Version: 1.0.0`. Every response echoes the server's.
- **Same major → serve.** A newer minor on either side may add fields; the older peer ignores unknown fields rather than erroring (FR-000d).
- **Major mismatch → `426 Upgrade Required`**, with a body naming which side is out of date. No partial handling (SC-020).
- `GET /v1/capabilities` returns the server's contract version and feature list so the desktop can present a backend-gated feature as unavailable-because-out-of-date rather than hiding it (FR-000e).

## Request/response shapes (representative)

`POST /v1/sync/batch`
```json
{ "workspace_id": "uuid",
  "records": [ { "entity": "bug|session|test_case|test_plan|device|...",
                 "op": "upsert|soft_delete", "id": "uuid", "payload": { ... },
                 "client_updated_at": "ISO-8601" } ] }
```
```json
// 200
{ "results": [ { "id": "uuid", "status": "applied|duplicate|rejected",
                 "reason": "string?" } ], "server_cursor": "opaque" }
```

`POST /v1/media/upload-url`
```json
// 200
{ "upload_url": "https://…", "expires_at": "ISO-8601", "remote_ref": "opaque" }
```

## Error handling (normative)

| Status | When | Owner |
|--------|------|-------|
| `401` | Missing, invalid, expired, or revoked session credential | `api` middleware |
| `403` | Authenticated, but not an active member of the requested workspace | `core.Auth` |
| `409` | Conflicting concurrent update — last-writer-wins by `client_updated_at`, loser reported | `core/sync.go` |
| `422` | Payload contains an unredacted sensitive key (defensive reject) | `core/redaction` |
| `426` | Contract major-version mismatch | `api` middleware |
| `503` | Backend unavailable — desktop retains both outboxes and retries; **no user-facing failure** (SC-005) | — |

A `duplicate` result is **not** an error: it is the correct, expected outcome of a replay and must return `200` with `status:"duplicate"`, never `409`. Conflating the two would make every reconnect look like a conflict.

## Configuration (normative)

`core/config.go` reads the environment **once at startup and fails fast** — no scattered `os.Getenv` at call sites:

| Var | Purpose |
|---|---|
| `DATABASE_URL` | `postgres://user:pass@host:5432/db` |
| `PORT` | HTTP listen port (read in `api/main.go`) |
| `MEDIA_BUCKET`, `MEDIA_ENDPOINT`, credentials | S3-compatible object storage for bug-attached media |
| `GOOGLE_CLIENT_ID` | Audience the backend validates ID tokens against (FR-051b) |
| `SESSION_TTL`, `OFFLINE_GRACE` | Session expiry and offline grace window (default 30 days) |

The backend holds **no Google client secret** — the desktop is a public native client using PKCE (R19), so there is no secret to store on either side.

Missing or malformed configuration must abort at boot with a clear message — never surface later as a request-time failure.

## Conformance

Backend contract tests (Go, `testcontainers-go` against real PostgreSQL 16 — not a mock, because idempotency, 409 conflicts and partial-batch behaviour *are* database behaviour) assert:

- idempotent replays produce `status:"duplicate"` and no second row;
- a genuinely conflicting concurrent update produces `409`, not `duplicate`;
- `422` on a planted unredacted field, in every entity that carries free-form text;
- `426` on a major mismatch, with no partial write;
- reporting endpoints equal a fixture's ground-truth counts (SC-007);
- a simulated `503` leaves both desktop outboxes intact and re-syncs on recovery (SC-005);
- an aborted media upload leaves the capture `pending` and never links a truncated object (FR-044a);
- a Bug syncs successfully while its capture is still `pending` (FR-044b);
- **`401`** on absent/expired/revoked credentials, on every endpoint without exception;
- **`403`** when an authenticated user names a workspace they are not an active member of — asserted by calling the API directly with a foreign `workspace_id`, not through the UI (SC-023);
- an ID token with a wrong `aud`, a bad signature, an expired `exp`, or a mismatched `nonce` is **rejected**, and no session or User is created (FR-051b);
- signing in twice with the same Google `sub` but a **changed email** resolves to the same User with memberships intact (SC-024);
- a membership revoked while a desktop was offline causes that workspace's queued records to be rejected on reconnect, with a distinguishable reason the desktop can surface (research R20).
