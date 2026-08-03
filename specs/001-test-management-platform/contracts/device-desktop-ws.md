# Contract: Device ↔ Desktop Local WebSocket Protocol

**Contract version: `1.0.0`** (semver per FR-000c/d).

The performance- and privacy-critical core. The **desktop is the WS server** on the LAN; each SDK (iOS/Android) is a client. This protocol MUST behave identically on both platforms (Principle II). Payloads are JSON, except media chunks which are binary frames. Sensitive fields are already redacted by the SDK before send (Principle I).

## Connection lifecycle

```
SDK                                        Desktop (WS server)
 │  ws connect (ws_url from QR)             │
 ├─────────────────────────────────────────▶ accept upgrade
 │  → hello {token | reconnect_cred,        │
 │           contract_version, capabilities}│
 ├─────────────────────────────────────────▶ validate token/credential
 │                                          │  ├─ major mismatch → nack(version_mismatch), close
 │                                          │  ├─ allowlist: device must be registered+enabled
 │  ◀───────────────────────────────────────┤  └─ ok → paired {device, cred, capabilities}
 │  → user_action / log_event / app_log     │
 ├─────────────────────────────────────────▶ gate → attribute → ephemeral store → live viewer
 │  → crash_report (on next launch)         │
 │  → media_chunk (binary, on bug attach)   │
 │  → heartbeat (periodic)                  │
 │  ...disconnect...                        │ detect drop; keep session; allow reconnect
```

## Messages: SDK → Desktop

### `hello`
First frame. Establishes trust **and** negotiates version (FR-000e).
```json
{ "type": "hello", "device_id": "string", "platform": "iOS|Android",
  "os_version": "13.7", "display_name": "string?",
  "contract_version": "1.0.0",
  "capabilities": ["api_capture","app_logs","crash_capture","user_actions","screenshots"],
  "pairing_token": "string?", "reconnect_credential": "string?" }
```
- Exactly one of `pairing_token` (first pairing) or `reconnect_credential` (return).
- Desktop rejects if: token expired/consumed (FR-020a); `allowlist` mode and device not registered+enabled (FR-017/018, SC-008); neither credential valid (FR-020); **or `contract_version` major differs** (FR-000c).
- `capabilities` is how the desktop knows an older SDK lacks a feature, so it can show it as unavailable-with-reason rather than hiding it (FR-050b). `screen_recording` appears here only if EX-001 ships.

### `user_action` *(new in v3)*
The grouping key. Emitted **before** the records it causes.
```json
{ "type": "user_action", "action_id": "string", "session_id": "string?",
  "action_type": "tap|long_press|swipe|scroll|text_input|app_launch|foreground|background",
  "direction": "up|down|left|right|null",
  "label": "Checkout", "label_source": "accessibility|text|identifier|positional",
  "screen_context": "CheckoutViewController", "occurred_at": "ISO-8601" }
```
- Emitted for every recognised interaction, **including ones that cause no traffic** — the desktop renders those as empty groups (FR-039d).
- `text_input` carries no content, ever; secure fields are never read (FR-039g).
- `label_source` lets the desktop show *why* a label is generic, and makes label quality measurable rather than anecdotal.

### `log_event`
One request-lifecycle phase. Streamed live including the in-progress `started` phase (FR-025).
```json
{ "type": "log_event", "request_id": "string", "action_id": "string|null",
  "session_id": "string", "phase": "started|body_captured|response_received|failed|completed",
  "method": "GET", "url": "https://…",
  "request_headers": {"Authorization": "«redacted»"},
  "request_body_preview": "string (redacted, truncated)",
  "status_code": 200, "response_headers": {}, "response_body_preview": "string",
  "error": "string?", "started_at": "ISO-8601", "duration_ms": 123,
  "response_size_bytes": 4096 }
```
- `action_id` is the action current **when the request started** (FR-039a), not when it completed. `null` is a valid, meaningful value → `Unattributed` (FR-039c). It must never be dropped.
- Listed sensitive keys MUST already be `«redacted»`. Desktop re-scans defensively but never trusts the wire.
- `request_id`+`phase` is idempotent; desktop de-duplicates replays (FR-036).

### `app_log` *(new in v3)*
```json
{ "type": "app_log", "log_id": "string", "action_id": "string|null",
  "session_id": "string", "level": "verbose|debug|info|warn|error",
  "tag": "OkHttp", "message": "string (redacted)",
  "source": "facade|platform", "logged_at": "ISO-8601" }
```
- `message` is redacted with the same spec as API bodies (FR-037b).
- `source` distinguishes always-captured SDK-facade logs from best-effort platform-logger logs (research R12) — a documented, matched boundary rather than an unexplained gap.

### `crash_report` *(new in v3)*
Sent on the **next launch** after a crash, not at crash time.
```json
{ "type": "crash_report", "crash_id": "string", "session_id": "string?",
  "exception_type": "NSInvalidArgumentException", "message": "string",
  "stack_trace": "string", "app_build": "2.4.1", "os_version": "13.7",
  "crashed_at": "ISO-8601", "log_window": { "api": [...], "app": [...], "actions": [...] } }
```
- `log_window` is a **copy** taken at crash time, so clearing logs later cannot empty it (FR-038, FR-035c).

### `media_chunk` *(new in v3 — binary frames)*
Chunked, resumable transfer of a bug-attached capture (FR-044, research R16).
```json
// JSON control frame precedes the binary payload
{ "type": "media_chunk", "capture_id": "string", "bug_id": "string",
  "offset": 0, "chunk_size": 65536, "total_size": 2097152,
  "content_type": "image/png", "sha256": "…" }
```
- Offsets make an interrupted transfer **resume**, not restart, and the desktop only marks a capture complete after the full-object checksum verifies — preventing a truncated file from presenting as complete (spec edge case).

### `heartbeat`
`{ "type": "heartbeat", "ts": "ISO-8601" }` — liveness; absence signals disconnect.

## Messages: Desktop → SDK

### `paired`
```json
{ "type": "paired", "device": {...}, "reconnect_credential": "string",
  "contract_version": "1.0.0", "capabilities": ["action_grouping","media_upload"] }
```
Issued once on successful `hello`; the SDK stores the credential for automatic reconnect (US2 scenario 7) and the capability list so it can hide desktop-unsupported affordances.

### `test_case_push` *(new in v3 — FR-012a)*
```json
{ "type": "test_case_push", "session_id": "string", "test_case_id": "string",
  "title": "TC-042: Checkout Flow", "constraints": ["POST /api/orders → 201", "…"] }
```
SDK MUST present this for explicit Accept/Decline and MUST NOT begin capturing against the case until accepted.

### `test_case_response` *(SDK → Desktop, paired with the above)*
`{ "type": "test_case_response", "test_case_id": "string", "accepted": true }`

### `ack` / `nack`
`{ "type": "ack" }` / `{ "type": "nack", "reason": "expired_token|not_allowlisted|disabled|malformed|version_mismatch" }`

### `command`
`{ "type": "command", "action": "pause_capture|resume_capture|clear_log|request_screenshot" }` — supports FR-027/035a.

## Error & edge handling (normative)

| Condition | Required behavior | Source |
|---|---|---|
| Unregistered/disabled device in `allowlist` | `nack` + drop; never reaches viewer/store | FR-017/018, SC-008 |
| Expired or reused pairing token | `nack reason=expired_token`; close | FR-020a |
| **Contract major mismatch** | `nack reason=version_mismatch` naming the out-of-date peer; close. No partial connection | FR-000c, SC-020 |
| **Unknown message type or field** | **Ignore silently**; never error, never drop the rest of the stream | FR-000d |
| Malformed frame | Discard + record diagnostic; not shown as valid data | FR-036 |
| Duplicate `request_id`+`phase` | Keep exactly one; ignore replay | FR-036 |
| Record with `action_id: null` | Render under `Unattributed`; **never drop** | FR-039c |
| Device disconnect mid-session | Detect; session persists; reconnect allowed; no corruption | FR-035 |
| Media transfer interrupted | Resume from last acked offset; mark complete only after checksum verifies | FR-044a |
| Backend unreachable | Irrelevant to this path — streaming continues | FR-035, SC-005 |

## Conformance

`conformance/` replays a fixed fixture — traffic carrying every sensitive key, log lines at every level, and a scripted gesture sequence — through both SDKs and asserts:

- byte-identical redacted `log_event` and `app_log` frames across iOS/Android;
- identical `user_action` classification and label-derivation order for the same synthetic gesture sequence;
- in-progress `started` emitted before `completed`;
- no unredacted sensitive value in any frame (SC-006);
- ≥95% correct action attribution on a 20-interaction script, with every unattributed record explicitly `null` rather than missing (SC-010);
- an older-minor peer's unknown fields are ignored without error (SC-019);
- a major mismatch refuses cleanly (SC-020).

Parity failure = build failure (Principle II).
