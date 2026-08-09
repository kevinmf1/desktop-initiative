# feat-021 — Capture relay

**FRs:** FR-044 (device binary reaches durable backend storage), FR-044a (desktop-only upload,
queue/retry, pending state), FR-044b (metadata sync independent of binary)
**Depends on:** feat-020, feat-023 ✅
**By:** kevin-malik · **Closed:** 2026-08-10

## What landed

- **Resumable device → desktop transfer.** A `media_chunk` JSON control frame reserves the next
  binary frame. The desktop validates identity, size, bounds, content type and checksum metadata,
  writes at the declared offset, and ACKs only after the chunk is durably received. Conflicting or
  malformed chunks are discarded with a NACK/diagnostic. Replays overwrite the same offset rather
  than duplicating bytes; a stale control frame cannot capture a later binary.
- **Verified local evidence.** `capture.rs` stores one hashed `.json`/`.bin` pair per capture. A
  complete object is offered to upload only after its full SHA-256 matches; a mismatch clears the
  corrupt bytes and waits for a resend. Partial, verified-but-local, and confirmed captures remain
  distinct states.
- **Independent media outbox.** A 90-second media timer runs separately from the record outbox and
  performs the contract sequence: `POST /v1/media/upload-url`, direct object-storage `PUT`, then
  `POST /v1/media/{capture_id}/confirm`. Any failure leaves the bytes on disk and queued. Only a
  successful confirm records `remote_ref`/`uploaded_at`.
- **Independent metadata sync.** Capture metadata is appended after its Bug in the normal
  `/v1/sync/batch`; the binary never enters that request. Chunk receipt and upload confirmation
  each advance the metadata clock and clear `synced_at`. A version check prevents the record timer
  from overwriting a newer `remote_ref` when both outboxes finish concurrently.
- **Visible evidence-in-transit.** The Bugs screen lists captures scoped by workspace and bug as
  `Receiving N%`, `Pending upload`, or `Uploaded`, including media type and size. **Sync now** drains
  record and media outboxes independently, then refreshes both Bug and capture state.
- **Startup wiring.** Capture storage is configured before the WebSocket listener starts, both
  outboxes start with the app, and capture listing/manual upload are registered Tauri commands.

## Deliberate simplifications

- File pairs instead of a database: the metadata sits beside its bytes and remains writable from
  the WebSocket path without a Tauri handle. Move behind the same functions if a workspace grows to
  thousands of captures.
- Fixed retry rather than exponential backoff: queued state is durable, and the operator can also
  request an immediate attempt from the Bugs screen.
- No custom media viewer: the desktop shows transfer state and the backend receives the confirmed
  object. Rendering/streaming arbitrary media locally is not required by FR-044 and would add a
  second serving path.

## Evidence

`./verify.sh build` → `HARNESS_VERIFY: PASS (build)` · `./verify.sh test` →
`HARNESS_VERIFY: PASS (test)` (2026-08-10). Vitest 68/68; Rust 91/91.

- Rust capture tests prove offset resume, checksum-gated completion, corrupt-object clearing,
  malformed-control refusal, and the real loopback HTTP order `upload-url → PUT exact bytes →
  confirm`, including the persisted `remote_ref`.
- The WebSocket integration test sends a real control frame plus binary, waits for the per-chunk
  ACK, verifies the stored bytes/metadata, and proves an unannounced binary files nothing.
- Sync tests prove Bug and capture metadata share a batch while binary upload remains pending,
  uploaded metadata uses confirmation time, and a concurrent media update is neither overwritten
  nor falsely marked synced.
- Bugs screen tests prove all three transfer labels, attached-capture rendering, and that **Sync
  now** invokes both independent outboxes while an offline Bug remains locally available.

## Follow-up

- feat-022 is the sole remaining open desktop feature and can proceed independently.
