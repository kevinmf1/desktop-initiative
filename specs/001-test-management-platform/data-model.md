# Phase 1 Data Model: QA Test Management Platform (v3)

Derived from the spec's Key Entities and Functional Requirements. Field types are logical. IDs are UUIDs unless noted; timestamps are UTC.

**Three stores, three durability classes.** Getting an entity into the wrong class is the most consequential mistake available in this data model, so it is the first thing every entity declares:

| Store                                         | Owner                    | Durability                                                                |
| --------------------------------------------- | ------------------------ | ------------------------------------------------------------------------- |
| **Device** (SQLite/Room + files on the phone) | SDK                      | Bounded ring buffers for live data; durable for crashes + capture library |
| **Desktop** (SQLite)                          | Tauri app                | Durable local-first; source of the sync outboxes                          |
| **Backend** (PostgreSQL 16 + object storage)  | Go `core/internal/store` | Durable, shared, cross-device                                             |

## Entity overview

| Entity              | Lives in                                           | Synced to backend               | Source FRs             | New in v3 |
| ------------------- | -------------------------------------------------- | ------------------------------- | ---------------------- | --------- |
| Workspace           | desktop → backend                                  | yes                             | FR-001                 |           |
| **User**            | backend (authoritative) → desktop cache            | backend-owned                   | FR-001a, FR-051        | ✅ revised |
| **Workspace Membership** | backend (authoritative) → desktop cache       | backend-owned                   | FR-056…056d            | ✅        |
| **Identity**        | backend only                                       | backend-only                    | FR-051…051b            | ✅        |
| **Auth Session**    | backend + desktop cache                            | backend-owned                   | FR-052…054             | ✅        |
| Test Case           | desktop → backend                                  | yes                             | FR-003…008             |           |
| Tag                 | desktop → backend                                  | yes                             | FR-004                 |           |
| Test Plan           | desktop → backend                                  | yes                             | FR-009…011             |           |
| Test Plan Item      | desktop → backend                                  | yes                             | FR-007, FR-034         |           |
| Device              | desktop → backend                                  | yes                             | FR-015…019, FR-022     |           |
| Pairing Token       | desktop only                                       | **no**                          | FR-016, FR-020a        |           |
| Test Session        | desktop → backend                                  | yes                             | FR-012, FR-014, FR-021 |           |
| Session Case Result | desktop → backend                                  | yes                             | FR-003a, FR-034        |           |
| **User Action**     | device → desktop                                   | **no** (ephemeral)              | FR-039…039i            | ✅        |
| API Log Event       | device → desktop                                   | **no** (ephemeral)              | FR-023…025, FR-035a    |           |
| **App Log Event**   | device → desktop                                   | **no** (ephemeral)              | FR-037…037b            | ✅        |
| **Crash Report**    | device (durable) → desktop                         | **no**                          | FR-038…038b, FR-035c   | ✅        |
| **Screen Capture**  | device (durable) → desktop → backend _if attached_ | **only when attached to a Bug** | FR-040…048             | ✅        |
| Bug                 | desktop → backend                                  | yes                             | FR-013, FR-030…032     |           |
| Evidence            | desktop → backend                                  | yes                             | FR-031, FR-032, FR-044 |           |

---

## Workspace

- `id`, `name`, `created_at`, `updated_at`
- 1→N Test Cases, Tags, Test Plans, Devices, Sessions, Bugs. All queries workspace-scoped (FR-001).
- **A Workspace does not own Users.** It has *members*, via Workspace Membership below. A user may belong to many workspaces and a workspace has many users.

## User *(revised in v3 — no longer workspace-scoped)*

Global to the installation.

- `id`, `display_name`, `email`, `avatar_url` (nullable), `created_at`, `last_login_at` (nullable)
- **No `workspace_id`.** The previous model put a `workspace_id` FK on User, which made a user structurally incapable of belonging to a second workspace — a modelling error, not a deliberate MVP constraint. Reaching a workspace is now exclusively via Workspace Membership (FR-001a).
- `email` here is a display convenience copied from the verified Identity. It is **not** an identity key — see Identity.

## Workspace Membership *(new in v3)*

The many-to-many link, and **the sole authority on access** (FR-056).

- `id`, `workspace_id`, `user_id`, `role` (default `admin`), `status` (`active|invited|removed`), `invited_by` (nullable → User), `joined_at`
- **Unique on (`workspace_id`, `user_id`)** — a user has at most one membership per workspace.
- Rules:
  - Every member is `admin` for now; the column exists so introducing real roles later is a data change, not a schema change (FR-002).
  - Access checks ask exactly one question: *is there an `active` membership for this (user, workspace)?* Enforced **server-side on every request**, never inferred from what the desktop asks for (FR-056b).
  - `status='removed'` is retained rather than deleted, so historical `created_by`/`started_by` references on test content stay resolvable.

## Identity *(new in v3)*

A verified external sign-in linked to a User (FR-051).

- `id`, `user_id`, `provider` (`google`), `subject`, `email`, `email_verified` (bool), `linked_at`, `last_verified_at`
- **Unique on (`provider`, `subject`)** — this is the identity key.
- Rules:
  - **Keyed on the provider's stable `subject`, never on email.** Google emails can change and can be reassigned within a workspace domain; keying on email would silently merge two people or split one (FR-051, SC-024). This is the single most consequential field choice in the auth model.
  - `provider` is an enum with one member today. Email/password and enterprise IdPs are additive rows, not a schema rewrite (FR-001b as amended).
  - `email_verified` is recorded from the assertion; an unverified email must never be used to auto-link an existing User, which would be an account-takeover path.

## Auth Session *(new in v3)*

A backend-minted session credential. **Stored hashed** on the backend; cached on the desktop.

- `id`, `user_id`, `token_hash`, `refresh_token_hash` (nullable), `issued_at`, `expires_at`, `offline_grace_until`, `revoked_at` (nullable), `client` (`desktop`)
- Rules:
  - Minted by the backend after it independently verifies the provider assertion (FR-051b). **Provider tokens are never used as the system's session credential and never forwarded** (FR-052).
  - The desktop caches the credential plus a snapshot of the user's memberships so it can operate with no connectivity (FR-052a).
  - `offline_grace_until` (default `issued_at` + 30 days) is what keeps authentication compatible with Principle III: within it, the desktop is fully functional offline (FR-053).
  - Grace expiry MUST NOT interrupt a running Test Session or block access to local data — it may only gate starting a *new* session (FR-053a).
  - Sign-out clears the desktop cache and revokes server-side; already-synced data is untouched (FR-054).
  - **Naming hazard**: "Auth Session" and "Test Session" are unrelated. An Auth Session is a signed-in user; a Test Session is a test run. They share no foreign key.

> **The mobile SDKs appear nowhere in this section, deliberately.** A device authenticates to nothing — it pairs to a desktop with a short-lived pairing token and holds no user identity (FR-055). Adding user credentials to the device would put real secrets on the least-controlled surface in the system.

## Test Case

Canonical reusable content. **No stored run-status, no build-version field.**

- `id`, `workspace_id`, `title`, `description`, `platform` (`iOS|Android|Both`), `server`, `lifecycle` (`Active|Archived`), `created_by`, `created_at`, `updated_by`, `updated_at`, `deleted_at` (nullable)
- N↔N Test Plans via Test Plan Item; N↔N Tags.
- Rules: platform ∈ {iOS, Android, Both} (FR-003c); duplicate titles allowed (FR-008); `lifecycle` independent of run outcome (FR-003b); soft delete keeps historical session references resolvable (FR-006); audit fields updated on every edit (FR-005).
- **Derived, never stored** — `summary_status`, computed on read across this case's Test Plan Items: `Has Fail` → `Blocked` → `In Progress` → `All Passed` → `Not Run` (FR-003a).

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
- **v3**: `sdk_contract_version` + `sdk_capabilities` are recorded at handshake so the desktop can render out-of-date capabilities as unavailable-with-reason (FR-000e, FR-050b) rather than hiding them.

## Pairing Token

Desktop-local only; never synced.

- `token` (single-use secret), `ws_url`, `contract_version`, `issued_at`, `expires_at` (+5 min), `consumed_at` (nullable)
- State: `active` → `consumed` | `expired`. Refresh mints a new token and invalidates the prior (FR-020a).

## Test Session

- `id`, `workspace_id`, `test_plan_id` (nullable — ad hoc allowed), `device_id`, `name` (nullable, user-renameable), `started_by`, `started_at`, `stopped_at` (nullable), `build_version`, `platform`, `server`, `result` (`Passed|Failed|Blocked|Incomplete`, nullable until stopped)
- State: `active` (FR-012) → `stopped` (result recorded, FR-014). ≥2 concurrent, isolated by device + session id (FR-021). Continues during backend outage (FR-035).
- **v3**: `name` supports on-device session rename (FR-027d).

## Session Case Result

- `id`, `session_id`, `test_case_id`, `test_plan_id` (nullable), `status` (`Not Run|Passed|Failed|Blocked`), `accepted` (bool — tester Accept/Decline of the pushed case, FR-012a), `recorded_at`
- Authoritative source for Test Plan Item `instance_status` and the case-level derived summary (FR-034).

---

## User Action _(new in v3 — the grouping key)_

A tester interaction, captured automatically. **Device-local, streamed, ephemeral.**

- `action_id`, `session_id` (nullable — capture runs unpaired too), `device_id`, `type` (`tap|long_press|swipe|scroll|text_input|app_launch|foreground|background`), `direction` (nullable; swipe/scroll only), `label`, `label_source` (`accessibility|text|identifier|positional` — per FR-039i's precedence), `screen_context`, `occurred_at`, `causality_window_ms`
- Rules:
  - Detected automatically only; **no host-app API exists to create or label one** (FR-039f/039h).
  - `label` derived by FR-039i's order; `label_source` is recorded so label quality is measurable rather than guessed at.
  - Text-input actions record **only that input occurred** — never content, and secure fields are never read (FR-039g).
  - An action with zero attributed records still renders as an empty group (FR-039d).

**Attribution rule (FR-039a)** — the one rule most likely to be implemented wrong: an API Log Event or App Log Event is attributed to the action current **at the moment the record _starts_**, not when it completes. Records falling outside every action's causality window get `action_id = null` and render under `Unattributed` (FR-039c). Attributing at completion time would misfile every response that outlives the next tap.

## API Log Event

Request-lifecycle event. **Device-local, streamed, clearable, never backend-synced.**

- `request_id` (shared across phases), `action_id` (nullable → Unattributed), `session_id`, `device_id`, `phase` (`started|body_captured|response_received|failed|completed`), `method`, `url`, `request_headers` (redacted), `request_body_preview` (redacted), `status_code`, `response_headers` (redacted), `response_body_preview` (redacted), `error`, `started_at`, `duration_ms`, `response_size_bytes`
- Rules: redacted **at the SDK before emit** (FR-024); streamed live including the in-progress `started` phase (FR-025); clearable from either side (FR-035a); de-duplicated by `request_id`+`phase` (FR-036).

## App Log Event _(new in v3 — reverses the v2 exclusion)_

A host-app log line. **Device-local, streamed, clearable, never backend-synced.**

- `log_id`, `action_id` (nullable), `session_id`, `device_id`, `level` (`verbose|debug|info|warn|error`), `tag`, `message` (redacted), `logged_at`, `source` (`facade|platform`)
- Rules: same redaction spec as API capture (FR-037b); searchable/filterable by level and tag, full message never truncated in detail view (FR-037a).
- `source` distinguishes SDK-facade logs (always captured, parity-guaranteed) from platform-logger logs (best-effort, matched boundary per R12) — so a gap in capture is explainable rather than mysterious.

## Crash Report _(new in v3)_

**Device-durable** — survives app restart (FR-035c), unlike the ring-buffered log entities above.

- `crash_id`, `device_id`, `session_id` (nullable), `exception_type`, `message`, `stack_trace`, `app_build`, `os_version`, `crashed_at`, `log_window` (snapshot of API + App Log Events around the crash), `handled_by_host` (bool — whether a prior handler was chained)
- Rules: chains to any pre-existing host handler and never suppresses it (FR-038b); browsable as crash history after restart (FR-038a); the log window is **copied in at crash time**, not referenced, so clearing logs later cannot empty a crash.

## Screen Capture _(new in v3)_

**Device-durable**, in a capped library; becomes backend-durable only once attached to a Bug.

- `capture_id`, `type` (`screenshot` | `recording`), `session_id` (nullable), `test_case_id` (nullable), `bug_id` (nullable), `device_id`, `screen_context`, `app_build`, `captured_at`, `duration_ms` (recordings), `byte_size`, `local_path`, `upload_state` (`device_only|pending|stored`), `remote_ref` (nullable), `is_partial` (bool)
- Rules:
  - Screenshots are committed (FR-040); **recordings are gated on EX-001** — `type='recording'` rows exist in the model but no implementation task ships until the spike concludes.
  - Never auto-uploaded; leaves the device only on explicit attach/share (FR-048).
  - Library capped at 500 MB, evicting oldest **unattached** first; a capture with `bug_id` set is never auto-evicted (FR-047).
  - `upload_state` drives FR-044a's "pending upload" display — a Bug shows evidence-in-transit rather than appearing to have none.
  - `is_partial` marks an interrupted recording that was still finalised and retained (FR-045).
  - The SDK's own overlay is excluded from the pixels (FR-046) — free, because the overlay lives in a separate window (research R17).

---

## Bug

**Local-first on the desktop, synced to backend.**

- `id`, `workspace_id`, `session_id`, `test_case_id` (nullable), `test_plan_id` (nullable), `device_id`, `build_version`, `environment`, `title`, `description`, `severity` (`P0|P1|P2|P3`), `status` (`Open|In Progress|Resolved|Closed|Won't Fix`, default `Open`), `marker_timestamp`, `created_at`, `synced_at` (nullable)
- Rules: created by "Bug Occurred" **without stopping the session** (FR-013); rapid repeats each produce a distinct marker (US4 scenario 3); persisted locally even if the backend is unreachable (FR-035b).

## Evidence

- `id`, `bug_id`, `log_window` (copied API + App Log Events), `action_window` (copied preceding User Actions), `window_before_sec`, `window_after_sec` (default 30 each), `timeline_marker`, `capture_ids` (list → Screen Capture)
- Rules: time-based window, configurable, default ±30s (FR-032); **copied at bug-creation time**, so clearing the general log afterwards cannot empty a bug's evidence (FR-035b); `action_window` is new in v3 (FR-031) — a developer reading the bug sees the interactions that led to it, not just the traffic.

---

## Key relationships (text ERD)

```
── identity & access (backend-authoritative, desktop caches) ──
User      N─N Workspace         (via WorkspaceMembership, which holds role + status)
User      1─N Identity          (unique on provider+subject — NOT email)
User      1─N AuthSession       (offline_grace_until keeps the desktop usable offline)

── workspace-scoped content (desktop-authoritative, syncs up) ──
Workspace 1─N { Tag, TestCase, TestPlan, Device, TestSession, Bug }
TestCase  N─N TestPlan          (via TestPlanItem, which holds instance_status)
TestCase  N─N Tag
TestSession 1─N SessionCaseResult
TestSession 1─N Bug 1─N Evidence ─N ScreenCapture
Device 1─N TestSession

── ephemeral, device-local, never synced ──
UserAction 1─N APILogEvent      (action_id nullable → "Unattributed")
UserAction 1─N AppLogEvent      (action_id nullable → "Unattributed")

── device-durable ──
Device 1─N CrashReport          (embeds a copied log window)
Device 1─N ScreenCapture        (bug_id set ⇒ protected from eviction, uploads to backend)
```

## Validation & integrity rules (cross-entity)

- **Membership gate**: every workspace-scoped read and write MUST be authorized by an `active` Workspace Membership for the requesting user, enforced **server-side on every request** — never by trusting a `workspace_id` the client supplied (FR-056b, SC-023). This is the boundary an attacker attacks first: a client that simply asks for another workspace's ID must be refused.
- **Identity keying**: Identity is unique on (`provider`, `subject`) and MUST NOT be looked up or linked by email. An unverified email MUST never auto-link to an existing User (FR-051, SC-024).
- **Auth independence from local-first**: no auth check may prevent a running Test Session from continuing, or block reading locally-captured data. Within `offline_grace_until` the desktop MUST NOT require the backend or the identity provider for any operation (FR-053/053a, SC-022, Principle III).
- **Workspace immutability of records**: a Device, Test Session, Bug, or Screen Capture is bound to the workspace it was created in and MUST NOT be reattributed by switching the active workspace (FR-056c). Switching is refused outright while a session is running (FR-056d).
- **Credential hygiene**: session and refresh credentials are stored **hashed** at the backend; provider tokens are never persisted, never used as the system's session credential, and never forwarded to another component (FR-052).
- **Allowlist gate**: in `allowlist` mode, records from an unregistered/disabled device are rejected before reaching any viewer or store (FR-017, SC-008).
- **Redaction invariant**: no API Log Event, App Log Event, Crash Report, Bug, or Evidence row may contain an unredacted value for a listed sensitive key — asserted by conformance tests at the SDK, and independently by the backend's 422 gate (Principle I, SC-006).
- **Idempotency**: `request_id`+`phase` unique per session; record sync uses idempotency keys so a reconnect replay collapses to one row (`duplicate`, not a second insert); genuinely conflicting concurrent updates return 409 (FR-036, R9).
- **Attribution integrity**: every API/App Log Event carries an `action_id` or an explicit null — there is no third state, and a null must render as `Unattributed` rather than being dropped (FR-039c).
- **Evidence independence**: `log_window` and `action_window` are **copies**, never pointers into the live buffers.
- **Media/record independence**: a Bug is fully syncable with `upload_state='pending'` captures; media transfer failure must never block or roll back a Bug's record sync (FR-044b).
- **Eviction safety**: eviction may only select captures with `bug_id IS NULL`. If the cap cannot be met without violating that, refuse new recordings rather than evicting evidence (FR-047a).
- **Soft-delete integrity**: a deleted Test Case (`deleted_at` set) still resolves inside historical Session Case Results and Bugs (FR-006).
- **Version integrity**: a Device row's `sdk_contract_version` major must match the desktop's, or the connection is refused at handshake — no partial connection state exists (FR-000c, SC-020).
