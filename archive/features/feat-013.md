# feat-013 — Pairing by QR / pairing code

- **Status:** ✅ done · closed 2026-08-06 · **Depends on:** feat-005
- **Epic:** Desktop app (Tauri) · **By:** kevin-malik
- **Requirements:** FR-016, FR-020, FR-020a (research R4, `contracts/device-desktop-ws.md`)

## Done when

- Pairing is offered as a QR code plus a typable short code, with no IP address to enter (FR-016).
- A pairing token is single-use: it dies on first successful pairing (FR-020a).
- A pairing token expires 5 minutes after issue, whichever comes first (FR-020a).
- Refreshing mints a new token and invalidates the previous one (FR-020a).
- The device ID is never the trust decision — trust rests only on the short-lived token (FR-020).

## What landed

- `desktop/src-tauri/src/ws/pairing.rs`
  - `PairingToken` with `issued_at` / `expires_at` (+5 min) / `consumed_at`, held in a
    `PairingState(Mutex<Option<…>>)` — one active token, in memory only.
  - `mint()` overwrites the slot, so refresh *is* invalidation of the previous token.
  - `authorize()` is the trust gate: token absent → nack, slot empty → nack, consumed or expired →
    nack and clear, wrong code → nack and count the guess, correct → consume and return a
    `reconnect_credential`. `hello.device_id` is read for identification and never consulted for
    trust (FR-020).
  - Five wrong guesses burn the token, so a 9-digit code is not a brute-force oracle.
  - `local_ws_url()` learns the outward-routing LAN address from a connectionless UDP socket — no
    dependency, nothing sent — and falls back to loopback.
  - `invite()` renders the R4 payload (`ws_url`, `token`, `contract_version`) as a QR module grid;
    `mint_pairing_invite` is the command the webview calls.
- `desktop/src-tauri/src/ws/mod.rs` — `HelloHandshake` gains the contract's `device_id`,
  `pairing_token` and `reconnect_credential` fields, all `#[serde(default)]` so version negotiation
  is unchanged for a peer that sends none of them.
- `desktop/src/Devices.tsx` — pairing panel: QR (SVG rects, no `dangerouslySetInnerHTML`), the same
  token grouped `123 456 789`, a live expiry countdown, the ws URL / contract line, and Refresh.
  Expired and mint-failure states replace the code rather than showing a dead one.
- `desktop/src/App.tsx` — the Devices placeholder becomes the real screen.
- `desktop/src-tauri/Cargo.toml` — `qrcode` (no default features).

## Evidence

| Check | Result |
|---|---|
| QR + typable code + expiry, no address entry (FR-016) | `Devices.test.tsx` › *shows a QR, the pairing code and its expiry without asking for an address* ✅ |
| Refresh replaces the offered code (FR-020a) | `Devices.test.tsx` › *refreshing replaces the code* ✅ |
| An elapsed TTL stops offering the code (FR-020a) | `Devices.test.tsx` › *an expired token is shown as expired, with no code and no QR* ✅ |
| A mint failure is surfaced (FR-016 usability) | `Devices.test.tsx` › *a mint failure is surfaced instead of a blank panel* ✅ |
| Countdown / grouping boundaries | `Devices.test.tsx` › *the countdown and code grouping hold at their boundaries* ✅ |
| Single use (FR-020a) | `pairing.rs` › `a_token_pairs_once_and_never_again` ✅ |
| 5-minute TTL, inclusive at the boundary (FR-020a) | `pairing.rs` › `a_token_expires_five_minutes_after_issue` ✅ |
| Refresh invalidates the previous token (FR-020a) | `pairing.rs` › `refreshing_invalidates_the_previous_token` ✅ |
| Token is the gate, device ID is not (FR-020) | `pairing.rs` › `an_unknown_device_id_pairs_with_a_token_and_no_device_id_pairs_without_one` ✅ |
| Guess limit | `pairing.rs` › `repeated_wrong_codes_burn_the_token` ✅ |
| QR payload carries url + token + contract version (R4) | `pairing.rs` › `the_qr_encodes_the_url_token_and_contract_version` ✅ |
| Full build gate | `HARNESS_VERIFY: PASS (build)` — 2026-08-06 |
| Full test gate | `HARNESS_VERIFY: PASS (test)` — 2026-08-06; Vitest 36/36, Rust 47/47 |

The running signed-in app was not exercised: live auth still needs `GOOGLE_CLIENT_ID` and
`TESTLAB_API_BASE_URL`, and the screen sits behind sign-in. The real component tree runs in jsdom and
the token lifecycle is covered directly in Rust.

## Decisions

**The token is the pairing code.** The data model gives Pairing Token exactly one secret field, so
the 9 digits shown for manual entry are the same value the QR carries — one secret, one expiry, one
single-use flag. A separate display code would need its own lifecycle and could diverge from the
token it stands for.

**One active token in a slot, not a table of tokens with states.** "Refresh invalidates the
previous" then needs no bookkeeping: the previous token is gone rather than marked stale, and a
later reader cannot forget to check a flag. `active → consumed | expired` is still observable —
`consumed_at` for the single use, `expires_at` for the TTL — but only for the token that is current.

**The token is not persisted.** A restart must not resurrect a token whose 5 minutes elapsed while
the app was closed, and there is nothing to protect at rest.

**QR generation is Rust, rendering is React.** Consistent with the 2026-08-04 decision (binary/
encoded formats are produced in the core and cross the IPC as plain data): the webview receives a
boolean module grid and draws `<rect>`s, so nothing injects markup and no JS QR library ships.

## Scope held

- **Device registry is feat-014.** `reconnect_credential` is minted and returned so the SDK can
  store it per the contract, but nothing stores or re-verifies it here — a return visit re-pairs
  from the QR until feat-014 lands `reconnect_credential_hash`. `hello.reconnect_credential` is
  parsed and ignored, marked with a `ponytail:` note.
- **The `allowlist` / `open` access policy is feat-014** (FR-017/018); `authorize()` deliberately
  does not filter on registration.
- **The WS listener is feat-015.** `WS_PORT` is named once in `pairing.rs` so the QR and the future
  server cannot disagree; `authorize()` is a pure function feat-015 calls after
  `negotiate_handshake()`.
- **Manual endpoint entry was not built.** FR-016 makes it a MAY and forbids it as the default; the
  QR plus the code covers the required flow.
