# feat-015 · `device-desktop-ws` server with ≥2 concurrent visible device sessions

**FR-021** (with FR-000c/d, FR-017, FR-018, FR-019, FR-020, FR-022, FR-036 at the gate).
**Owner:** kevin-malik · **Closed:** 2026-08-10 · **Depends on:** feat-013 ✅, feat-014 ✅

## What landed

`desktop/src-tauri/src/ws/server.rs` — three things and nothing else:

- **`admit()`** — the handshake gate, a pure function, in the order `ws::pairing::Authorized`
  documents: disabled is refused first (FR-018), then `device::reconnects()` for a return visit,
  else `pairing::authorize()`, then `device::register()`, then `device::admits()`. Nothing reaches
  a session before all four have run.
- **`handle()`** — one task per client: negotiate the contract version, gate, answer `paired` with
  the device row and its reconnect credential, then stream records. It takes the gate as a
  parameter, so the protocol runs in tests with no Tauri app behind it.
- **`Sessions`** — records filed under `(device_id, session_id)`. That pair is the identity: two
  devices sharing a session ID stay two rows, and one device in two sessions stays two rows.

`start()` binds `0.0.0.0:WS_PORT` (8787, the port the QR already advertises) from `.setup()`, so
the listener is up before any screen opens and independent of the backend (Principle III). A bind
failure is reported and not fatal — the rest of the desktop still works.

FR-022's observed facts now arrive in `hello` (`platform`, `os_version`), so the registry can show
the source platform from the first handshake rather than waiting for a record.

The webview shows it: **Device sessions** on the Devices screen, polled on the pairing countdown's
existing 1s tick. `set_active_workspace` tells the Rust gate which workspace a connecting device
registers against — React owns the switcher, Rust owns the gate.

## Done when — met

| Criterion | Evidence |
|---|---|
| ≥2 concurrent device sessions | `two_devices_stream_concurrently_without_sharing_state`, `two_devices_connect_over_a_real_socket` (real `TcpListener`, two TCP clients) |
| State and logs isolated by device **and** session ID | same, plus `one_device_running_two_sessions_keeps_them_apart` |
| Visible | `shows concurrent device sessions kept apart by device and session ID` (Devices.test.tsx) |
| Gate order, policy, FR-022 | `a_token_pairs_registers_and_reports_the_platform`, `a_disabled_or_unregistered_device_is_nacked_at_the_handshake` |
| Version mismatch refuses cleanly, no session | `a_major_mismatch_is_nacked_and_never_opens_a_session` |
| Unknown types ignored, malformed discarded | asserted inside the two streaming tests |

`./verify.sh build` → `HARNESS_VERIFY: PASS (build)` · `./verify.sh test` →
`HARNESS_VERIFY: PASS (test)` · Vitest 43/43 · Rust 62/62 (2026-08-10).

## Not proven here

No real iOS/Android SDK has connected — none exists in this repo, and the peers' SDKs are other
people's projects. Every assertion above is against a client this repo drives. The wire format is
the contract's, but **conformance against a real SDK is a cross-project step**, not one this repo
can take alone.

## Deliberate ceilings

- Sessions are in memory, capped at 500 frames each (`MAX_RECORDS_PER_SESSION`). feat-023's
  local-first store is what makes them survive a restart.
- The webview polls once a second instead of taking a Rust-side event stream. Swap it if a busier
  bench makes the poll visible.
- `media_chunk` binary payloads are counted as liveness only — feat-021 owns the transfer.
- The gate holds the pairing lock across the whole handshake, which serialises concurrent pairings
  and keeps the read-modify-write of `devices.json` honest. Per-device locking if a bench ever pairs
  enough devices at once for it to matter.
