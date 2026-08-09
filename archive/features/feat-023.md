# feat-023 — Local-first store + `sync-api` client

**FRs:** FR-035 (a session keeps capturing while the backend is unreachable), FR-035b (bugs and
evidence persisted local-first and synced later; clearing general logs never removes a bug's
already-captured evidence), FR-036 (malformed messages discarded with a diagnostic; repeated
deliveries de-duplicated to one entry)
**Depends on:** feat-015 (`device-desktop-ws` server) ✅
**By:** kevin-malik · **Closed:** 2026-08-10

## What landed

Three files carry it: a durable frame log, the de-duplication that guards its door, and a sync
client that is never on a capture path.

- **`frames.rs` — the durable log.** One JSONL file per device, appended as frames arrive, each line
  carrying the session it was filed under. The session travels *beside* the frame because the
  contract lets `user_action` omit `session_id`, and the server's "current session" is the only
  thing that knows it. The device id is hashed into the filename rather than sanitised — it is
  user-supplied and reaches the filesystem.
- **The evidence window stayed derived.** feat-020's invariant survives intact: `retain` /
  `read` mean a Bug's excerpt is still *computed* from frames at read time, so widening a window
  re-reads rather than re-captures (FR-032) — it now re-reads from disk instead of from a
  memory ring, which is the whole of "local-first".
- **FR-035b's clearing clause is a function, not a promise.** `frames::retain` rewrites the file
  keeping only frames inside a given set of windows; `clear_device_logs` builds those windows from
  **every** bug on that device, including bugs in other workspaces — clearing one screen is not a
  licence to drop somebody else's evidence. `Sessions::clear` applies the same rule to the live rows
  so the screen and the file never disagree.
- **FR-036 — de-duplication.** `frames::identity` implements the contract's own key per message
  type (`request_id`+`phase` for a log event, `log_id`, `action_id`, `crash_id`,
  `capture_id`+`offset`). `Sessions::record` returns `false` for a replay, which becomes a
  diagnostic line and no second entry. A frame carrying **no** identity is never treated as a
  replay — dropping a real record on a guess is the worse failure. The `seen` set deliberately
  outlives a log clear, so a re-send after clearing is still a replay.
- **`sync.rs` — the outbox.** Not a queue: a **derived view** of the stores, every record whose
  `synced_at` is null. That is why it survives a restart with no extra file and why a crash
  mid-push costs nothing. Sessions are pushed before bugs (a bug names its session), each with its
  own clock as `client_updated_at`, in one `POST /v1/sync/batch` carrying
  `X-Contract-Version: 1.0.0` and an `Idempotency-Key` that is stable across replays — which is
  what makes the contract's `status:"duplicate"` reachable. `applied` and `duplicate` both clear
  the outbox; a rejection keeps the record queued **with the backend's reason** attached, so a
  membership revoked while offline (research R20) reads as a reason rather than as a sync that
  silently never finishes. `426` names the out-of-date side.
- **Unreachable is a report, never an error.** Not configured, not signed in, connection refused,
  any non-2xx: one `SyncReport { offline: true, queued: n }`, nothing marked, nothing lost
  (SC-005). `sync::start` drains on a 60s tick; the Bugs screen shows the queue count, a per-bug
  *Not yet synced*, and a **Sync now** button.
- **Bugs screen reads the durable log.** `device_records` replaced "list live sessions, then read
  each one" — after a restart there are no live rows to enumerate, and a bug's evidence must not
  depend on a device still being connected.

## Deliberate simplifications

- **JSONL, not SQLite.** The data model names SQLite; append-and-read-whole is a fraction of the
  code and correct at bench scale. Named in `frames.rs` with its ceiling (O(file) per 1s poll) and
  its upgrade path (offset index, or SQLite behind the same four functions).
- **One batch endpoint**, no per-entity routes, no exponential backoff — a fixed tick is enough for
  a desktop that is either on the LAN or not.
- **No `sync_queue` command.** A record's `synced_at` is already on screen, so the count is a
  `.filter()` in the webview rather than a second source of the same truth.
- **The HTTP call itself is not tested.** `post_batch` is one `send()` away from `offline_report`,
  which *is* tested; standing up a server in-process to assert a reqwest error would test reqwest.
  What must never regress — offline is a report, the record stays queued, nothing is marked — is
  asserted directly.
- **Only bugs and sessions sync.** Test cases, plans and devices have `PUT` routes in the contract
  and no local dirty-marker yet; adding one per store is scope for whoever needs cross-device
  authoring, not for FR-035b.

## Evidence

`./verify.sh build` → `HARNESS_VERIFY: PASS (build)` · `./verify.sh test` →
`HARNESS_VERIFY: PASS (test)` (2026-08-10). Vitest 67/67, Rust 82/82 (9 new).

Rust — `frames.rs`: an event's identity is stable across a replay and differs per phase, a frame
with no id is never a replay; frames are readable per device and per session after being written;
clearing keeps exactly a bug's window and drops the untimestamped frame; one unreadable line costs
that line and not the log. `ws/server.rs`: one run asserting a replay is dropped, a fresh
`Sessions` over the same directory still reads the frames (the restart), clearing keeps the window
and the live rows agree with the file, and the replay guard outlives the clear. `sync.rs`: the
outbox is this workspace's unsynced records, sessions first, each with its own clock; a replayed
batch carries the same idempotency key; `applied`/`duplicate` clear the outbox while a rejection
keeps it queued with its reason; offline is a report with the record still queued.

Webview — an unsynced bug says so, *Sync now* calls `sync_now`, and an offline report leaves both
the record and its excerpt untouched.

> Note on the run: three unrelated screen tests (App, Runner, TestPlans) timed out at 5s while a
> `cargo` build was running on the same machine, then passed on a quiet machine — repeatedly, in
> both `verify.sh` and direct runs. Nothing in this feature's code path is involved; the suite's
> 5s userEvent timeout is simply tight under load.

## Follow-ups

- feat-021 (capture relay) is unblocked: FR-044a's "pending upload" is the same `synced_at`-style
  marker applied to a capture, and the Bugs screen's *Attached captures* section is where it shows.
- feat-022 (reporting) can read `synced_at` if it ever needs "what the backend has" vs "what we
  have" — today every figure is computed locally, which is what SC-007 asks for.
- The pull half of `sync-api` (`GET /v1/sync/changes?since=`) is unbuilt: nothing in this repo yet
  consumes another desktop's records.
