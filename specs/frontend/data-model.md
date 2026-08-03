# Phase 1 Data Model (Desktop): QA Test Management Platform (v3)

The desktop's **local-first SQLite store**, derived from the umbrella data model ([../001-test-management-platform/data-model.md](../001-test-management-platform/data-model.md)). Field types are logical. IDs are UUIDs unless noted; timestamps are UTC. Where the desktop and umbrella disagree, the umbrella wins.

**Three stores, three durability classes.** Getting an entity into the wrong class is the most consequential mistake available in this data model. The desktop owns the middle store; it caches a slice of the backend's; it receives (but never durably persists) the device's ephemeral stream.

| Store                                         | Owner                    | Durability                                                                |
| --------------------------------------------- | ------------------------ | ------------------------------------------------------------------------- |
| **Device** (SQLite/Room + files on the phone) | SDK                      | Bounded ring buffers for live data; durable for crashes + capture library |
| **Desktop** (SQLite)                          | **Tauri app (this project)** | **Durable local-first; source of the two sync outboxes**              |
| **Backend** (PostgreSQL 16 + object storage)  | Go `core/internal/store` | Durable, shared, cross-device                                             |

## Entity overview — from the desktop's point of view

`owns` = the desktop is authoritative locally and syncs up. `caches` = the backend is authoritative; the desktop holds a read snapshot for offline operation. `receives` = arrives over the WS stream, rendered/grouped, never durably persisted or synced. `stages` = binary held on the desktop mid-transfer.

| Entity              | Desktop role | Synced to backend               | Source FRs             |
| ------------------- | ------------ | ------------------------------- | ---------------------- |
| Workspace           | owns / syncs                            | yes                             | FR-001                 |
| **User**            | **caches** (backend-authoritative)      | backend-owned                   | FR-001a, FR-051        |
| **Workspace Membership** | **caches** (drives the switcher)   | backend-owned                   | FR-056…056d            |
| **Auth Session**    | **caches** (OS keychain)                | backend-owned                   | FR-052…054             |
| Test Case           | owns / syncs                            | yes                             | FR-003…008             |
| Tag                 | owns / syncs                            | yes                             | FR-004                 |
| Test Plan           | owns / syncs                            | yes                             | FR-009…011             |
| Test Plan Item      | owns / syncs                            | yes                             | FR-007, FR-034         |
| Device              | owns / syncs                            | yes                             | FR-015…019, FR-022     |
| **Pairing Token**   | **owns — desktop-only**                 | **no**                          | FR-016, FR-020a        |
| Test Session        | owns / syncs                            | yes                             | FR-012, FR-014, FR-021 |
| Session Case Result | owns / syncs                            | yes                             | FR-003a, FR-034        |
| User Action         | **receives** (grouping key)             | **no** (ephemeral)              | FR-039…039i            |
| API Log Event       | **receives**                            | **no** (ephemeral)              | FR-023…025, FR-035a    |
| App Log Event       | **receives**                            | **no** (ephemeral)              | FR-037…037b            |
| Screen Capture      | **stages** (device_only→pending→stored) | **only when attached to a Bug** | FR-040…048             |
| Bug                 | owns / syncs                            | yes                             | FR-013, FR-030…032     |
| Evidence            | owns / syncs                            | yes                             | FR-031, FR-032, FR-044 |

> Entities the desktop does **not** hold: `Identity` (backend-only — verified sign-ins), `Crash Report` (device-durable; streamed to the desktop for display but owned on the phone). The desktop *displays* a received crash's `log_window` but is not its authoritative store.

---

## Workspace

- `id`, `name`, `created_at`, `updated_at`
- 1→N Test Cases, Tags, Test Plans, Devices, Sessions, Bugs. All desktop queries workspace-scoped to the **active workspace** (FR-001).
- **A Workspace does not own Users.** It has *members*, via the cached Workspace Membership below.

## Test Case

Canonical reusable content. **No stored run-status, no build-version field.**

- `id`, `workspace_id`, `title`, `description`, `platform` (`iOS|Android|Both`), `server`, `lifecycle` (`Active|Archived`), `created_by`, `created_at`, `updated_by`, `updated_at`, `deleted_at` (nullable)
- N↔N Test Plans via Test Plan Item; N↔N Tags.
- Rules: platform ∈ {iOS, Android, Both} (FR-003c); duplicate titles allowed (FR-008); `lifecycle` independent of run outcome (FR-003b); soft delete keeps historical session references resolvable (FR-006); audit fields updated on every edit (FR-005).
- **Derived, never stored** — `summary_status`, computed on read across this case's Test Plan Items: `Has Fail` → `Blocked` → `In Progress` → `All Passed` → `Not Run` (FR-003a). Per-instance status is visible when a row is expanded.

## Tag

- `id`, `workspace_id`, `name`. N↔N Test Cases (FR-004).

## Test Plan

- `id`, `workspace_id`, `name`, `notes`, `target_build`, `environment`, `lifecycle` (`Active|Archived`), `created_at`, `updated_at`
- 1→N Test Plan Items; referenced by Sessions and Bugs. Duplicate clones items, not underlying cases (FR-009/010/011).

## Test Plan Item

- `id`, `test_plan_id`, `test_case_id`, `instance_status` (`Not Run|Passed|Failed|Blocked`, default `Not Run`), `updated_at`
- Reflects the latest Session Case Result for this case within this plan (FR-034); a case in N plans has N independent statuses, which feed the case's derived summary.

## Device

- `id`, `workspace_id`, `device_id` (SDK-reported, stable, **not** an auth token), `display_name`, `observed_platform` (`iOS|Android|null`), `enabled` (default true), `reconnect_credential_hash` (nullable), `sdk_contract_version`, `sdk_capabilities` (list), `os_version`, `registered_at`
- Rules: `device_id`/allowlist is filtering only, never authentication (FR-020); enable/disable without deleting registration (FR-018); persists across desktop restarts (FR-019); removal requires re-registration.
- `sdk_contract_version` + `sdk_capabilities` are recorded at handshake so the desktop can render out-of-date capabilities as *unavailable-for-this-device with a reason* (FR-000e, FR-050b) rather than hiding them.

## Pairing Token *(desktop-only; never synced)*

- `token` (single-use secret), `ws_url`, `contract_version`, `issued_at`, `expires_at` (+5 min), `consumed_at` (nullable)
- State: `active` → `consumed` | `expired`. Refresh mints a new token and invalidates the prior (FR-020a). Encoded into the QR alongside `ws_url` and `contract_version` (research R4).

## Test Session

- `id`, `workspace_id`, `test_plan_id` (nullable — ad hoc allowed), `device_id`, `name` (nullable, user-renameable), `started_by`, `started_at`, `stopped_at` (nullable), `build_version`, `platform`, `server`, `result` (`Passed|Failed|Blocked|Incomplete`, nullable until stopped)
- State: `active` (FR-012) → `stopped` (result recorded, FR-014). ≥2 concurrent, isolated by device + session id (FR-021). Continues during a backend outage (FR-035). A workspace switch is refused while any session is `active` (FR-056d).

## Session Case Result

- `id`, `session_id`, `test_case_id`, `test_plan_id` (nullable), `status` (`Not Run|Passed|Failed|Blocked`), `accepted` (bool — tester Accept/Decline of the pushed case, FR-012a), `recorded_at`
- Authoritative source for Test Plan Item `instance_status` and the case-level derived summary (FR-034).

---

## Backend-authoritative entities the desktop CACHES

These three rows are owned by the backend; the desktop holds a read snapshot so it can operate through the 30-day offline grace with **no auth network calls** (FR-052a, R20). The backend remains the authority — the cache is never the access decision.

### User *(cached)*

Global to the installation.

- `id`, `display_name`, `email`, `avatar_url` (nullable), `created_at`, `last_login_at` (nullable)
- **No `workspace_id`** — reaching a workspace is exclusively via Workspace Membership (FR-001a).
- `email` is a display convenience copied from the verified Identity; it is **not** an identity key. `Identity` itself (provider/subject) is backend-only and never reaches the desktop.

### Workspace Membership *(cached snapshot — drives the active-workspace switcher)*

- `id`, `workspace_id`, `user_id`, `role` (default `admin`), `status` (`active|invited|removed`), `invited_by` (nullable → User), `joined_at`
- **Unique on (`workspace_id`, `user_id`)**.
- Rules:
  - The desktop lists every `active` membership as a switchable workspace (FR-056a) and scopes all content to the active one.
  - Every member is `admin` for now; the column exists so real roles later are a data change, not a schema change (FR-002).
  - **The desktop's cache is a convenience, not the gate.** The access decision — *is there an `active` membership for this (user, workspace)?* — is enforced **server-side on every request** (FR-056b). A stale cache may let a since-revoked user act offline; the backend rejects that workspace's records on reconnect and the desktop must surface the rejection (R20).

### Auth Session *(cached in the OS keychain)*

A backend-minted session credential. **Stored hashed** on the backend; cached on the desktop.

- `id`, `user_id`, `token_hash`, `refresh_token_hash` (nullable), `issued_at`, `expires_at`, `offline_grace_until`, `revoked_at` (nullable), `client` (`desktop`)
- Rules:
  - Minted by the backend after it independently verifies the provider assertion (FR-051b). **Provider (Google) tokens are never used as the system's session credential and never forwarded** (FR-052).
  - The desktop caches the credential plus the membership snapshot above so it can operate with no connectivity (FR-052a).
  - `offline_grace_until` (default `issued_at` + 30 days) is what keeps authentication compatible with Principle III: within it the desktop is fully functional offline (FR-053).
  - Grace expiry MUST NOT interrupt a running Test Session or block access to local data — it may only gate starting a *new* session (FR-053a).
  - Sign-out clears the desktop cache and revokes server-side; already-synced data is untouched (FR-054).
  - **Naming hazard**: "Auth Session" (a signed-in user) and "Test Session" (a test run) are unrelated and share no foreign key.

---

## Ephemeral device entities the desktop RECEIVES

These arrive over `contracts/device-desktop-ws.md`, are rendered and grouped in the live inspector, and are held only in a **capped in-memory ring buffer per session** (spilling to SQLite for scroll-back, R10). **They are never synced to the backend and are clearable from either side.** They enter durable storage only as **copies** inside an Evidence row at bug-creation time (see below).

### User Action *(the grouping key)*

- `action_id`, `session_id` (nullable — capture runs unpaired too), `device_id`, `type` (`tap|long_press|swipe|scroll|text_input|app_launch|foreground|background`), `direction` (nullable; swipe/scroll only), `label`, `label_source` (`accessibility|text|identifier|positional`), `screen_context`, `occurred_at`, `causality_window_ms`
- Desktop rendering rules: an action with zero attributed records still renders as an **empty group** (FR-039d); the `label_source` lets the desktop show *why* a label is generic. Actions are detected on-device only — the desktop never creates or labels one (FR-039f/039h). Text-input actions carry no content, ever (FR-039g).

### API Log Event

- `request_id` (shared across phases), `action_id` (nullable → Unattributed), `session_id`, `device_id`, `phase` (`started|body_captured|response_received|failed|completed`), `method`, `url`, `request_headers` (redacted), `request_body_preview` (redacted), `status_code`, `response_headers` (redacted), `response_body_preview` (redacted), `error`, `started_at`, `duration_ms`, `response_size_bytes`
- Desktop rules: streamed live including the in-progress `started` phase (FR-025); de-duplicated by `request_id`+`phase` (FR-036); the desktop **re-scans defensively** for unredacted sensitive keys but never trusts the wire (R7).

### App Log Event

- `log_id`, `action_id` (nullable), `session_id`, `device_id`, `level` (`verbose|debug|info|warn|error`), `tag`, `message` (redacted), `logged_at`, `source` (`facade|platform`)
- Desktop rules: searchable/filterable by level and tag, full message never truncated in detail view (FR-037a); `source` distinguishes always-captured facade logs from best-effort platform-logger logs (R12).

**Attribution rule (FR-039a) — the one the desktop's grouping most depends on**: an API Log Event or App Log Event is attributed to the action current **at the moment the record _starts_**, not when it completes. The desktop groups by the `action_id` on the frame; a `null` `action_id` is a valid, meaningful value → renders under **`Unattributed`** (FR-039c) and must **never** be dropped. There is no third state.

---

## Screen Capture *(desktop STAGES the binary)*

The binary is device-durable in the SDK's capped library; it becomes backend-durable only once attached to a Bug. On the desktop it exists as a **staging row + a staged file** during transfer (research R16).

- `capture_id`, `type` (`screenshot` | `recording`), `session_id` (nullable), `test_case_id` (nullable), `bug_id` (nullable), `device_id`, `screen_context`, `app_build`, `captured_at`, `duration_ms` (recordings), `byte_size`, `local_path` (the desktop's staged path), `upload_state` (`device_only|pending|stored`), `remote_ref` (nullable), `is_partial` (bool)
- Desktop staging rules:
  - `upload_state` state machine on the desktop: **`device_only`** (still only on the phone) → **`pending`** (received over the WS, staged locally, queued on the media outbox) → **`stored`** (uploaded to backend object storage via a pre-signed URL and confirmed after checksum verify).
  - `upload_state` drives FR-044a's "pending upload" display — a Bug shows evidence-in-transit rather than appearing to have none.
  - Chunked binary frames carry `offset`s so an interrupted transfer **resumes**, not restarts; the desktop marks a capture `stored` **only after** the full-object checksum verifies — no truncated file ever presents as complete.
  - `is_partial` marks an interrupted recording that was still finalised and retained (FR-045).
  - Screenshots are committed (FR-040); **recordings are gated on EX-001** — `type='recording'` rows exist in the model but no implementation ships until the spike concludes, and no recording affordance appears in the UI until then (FR-050b).

---

## Bug

**Local-first on the desktop, synced to backend.**

- `id`, `workspace_id`, `session_id`, `test_case_id` (nullable), `test_plan_id` (nullable), `device_id`, `build_version`, `environment`, `title`, `description`, `severity` (`P0|P1|P2|P3`), `status` (`Open|In Progress|Resolved|Closed|Won't Fix`, default `Open`), `marker_timestamp`, `created_at`, `synced_at` (nullable)
- Rules: created by "Bug Occurred" **without stopping the session** (FR-013); rapid repeats each produce a distinct marker, never merged (US4 scenario 3); persisted locally even if the backend is unreachable (FR-035b); syncs on the **record outbox** independently of any attached media (FR-044b).

## Evidence

- `id`, `bug_id`, `log_window` (copied API + App Log Events), `action_window` (copied preceding User Actions), `window_before_sec`, `window_after_sec` (default 30 each), `timeline_marker`, `capture_ids` (list → Screen Capture)
- Rules: time-based window, configurable, default ±30s (FR-032); **copied at bug-creation time**, so clearing the general log afterwards cannot empty a bug's evidence (FR-035b); `action_window` gives a developer the interactions that led to the bug, not just the traffic (FR-031).

---

## Cross-entity validation & integrity rules (desktop-relevant)

- **Membership gate (respected, not enforced, by the desktop)**: every workspace-scoped read/write is authorized by an `active` Workspace Membership, enforced **server-side on every request** — never by trusting a `workspace_id` the desktop supplied (FR-056b, SC-023). The desktop scopes its UI to the active workspace and its cached memberships, but must expect and surface a backend `403`/rejection when its cache is stale.
- **Evidence independence (copies, not pointers)**: `log_window` and `action_window` are **copies** taken at bug-creation time, never pointers into the live ring buffers. Clearing the general log afterwards cannot empty a bug's evidence (FR-035b).
- **Media/record independence**: a Bug is fully syncable while its captures are still `upload_state='pending'`; a media transfer failure must **never** block or roll back a Bug's record sync — the record outbox and the media outbox are independent (FR-044b, R9/R16).
- **Idempotency**: `request_id`+`phase` is unique per session and de-duplicates the live stream; the record outbox uses idempotency keys so a reconnect replay collapses to one row (backend returns `duplicate`, not a second insert), and a genuinely conflicting concurrent update returns `409` (FR-036, R9). The desktop must treat `duplicate` as success, never as a conflict.
- **Workspace immutability of records**: a Device, Test Session, Bug, or Screen Capture is bound to the workspace it was created in and MUST NOT be reattributed by switching the active workspace (FR-056c). Switching is refused outright while a session is running (FR-056d).
- **Allowlist gate**: in `allowlist` mode, records from an unregistered/disabled device are rejected at the WS gate **before** reaching any viewer or store (FR-017, SC-008).
- **Redaction re-scan (defensive only)**: no rendered or stored API/App Log Event, Bug, or Evidence row may show an unredacted value for a listed sensitive key. The desktop re-scans defensively; the real gates are source redaction (SDKs) and the backend 422 (Principle I, SC-006, R7).
- **Attribution integrity**: every received API/App Log Event carries an `action_id` or an explicit `null` — there is no third state, and a `null` must render as `Unattributed` rather than being dropped (FR-039c).
- **Auth independence from local-first**: no auth check may prevent a running Test Session from continuing or block reading locally-captured data; within `offline_grace_until` the desktop makes no auth network calls (FR-053/053a, SC-022, Principle III).
- **Soft-delete integrity**: a deleted Test Case (`deleted_at` set) still resolves inside historical Session Case Results and Bugs (FR-006).
- **Version integrity**: a Device row's `sdk_contract_version` major must match the desktop's, or the connection is refused at handshake — no partial connection state exists (FR-000c, SC-020).
