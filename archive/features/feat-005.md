# feat-005 — Contract version and capability handshake

- **Status:** ✅ done · closed 2026-08-03 · **Depends on:** feat-004
- **Epic:** Desktop app (Tauri) · **By:** kevin-malik
- **Requirements:** FR-000c, FR-000d, FR-000e / SC-019, SC-020

## Done when

- Peers on the same `device-desktop-ws` contract major connect, including differing minor,
  prerelease, and build versions.
- A major mismatch refuses with `nack reason=version_mismatch`, names whether the device SDK or
  desktop is out of date, and tells the user which side to upgrade.
- Unknown JSON fields and unknown message types are ignored for additive-minor compatibility.
- `hello` records the device contract version and capabilities; the accepted response exchanges
  the desktop version and capability list.
- A capability absent from the device handshake is returned as
  `UnavailableBecauseOutOfDate` with a user-facing upgrade reason.
- No WebSocket listener, pairing-token validation, or device registry is included; those remain
  feat-015, feat-013, and feat-014 respectively.

## What landed

- `desktop/src-tauri/src/ws/mod.rs`
  - dependency-free semantic-version validation and major comparison;
  - forward-compatible `hello` deserialization using Serde's default unknown-field behavior and
    an explicit ignored-unknown-message outcome;
  - accepted handshake data containing both peers' versions/capabilities;
  - serializable explanatory version-mismatch `nack`;
  - explicit per-capability availability with an upgrade reason;
  - nine Rust unit tests covering the requirements and malformed versions.
- `desktop/src-tauri/src/lib.rs` exports the module for the later WebSocket server.

## Evidence

| Check | Result |
|---|---|
| Same major, different minor connects | `ws::tests::same_major_connects_and_exchanges_capabilities` ✅ |
| Valid prerelease/build semver connects | `ws::tests::valid_semver_prerelease_and_build_metadata_connect` ✅ |
| Older SDK major refused, SDK named stale | `ws::tests::older_major_refuses_and_names_device_sdk_as_stale` ✅ |
| Newer SDK major refused, desktop named stale | `ws::tests::newer_major_refuses_and_names_desktop_as_stale` ✅ |
| Unknown fields/messages ignored | `unknown_hello_fields_are_ignored`, `unknown_message_types_are_ignored` ✅ |
| Missing capability has explicit reason | `missing_capability_is_explicitly_unavailable_with_upgrade_reason` ✅ |
| Paired response exchanges version/capabilities | `paired_frame_serializes_the_version_and_capabilities` ✅ |
| Invalid semantic versions rejected | `malformed_semver_is_rejected` ✅ |
| Full build gate | `HARNESS_VERIFY: PASS (build)` — 2026-08-03 |
| Full test gate | `HARNESS_VERIFY: PASS (test)` — 2026-08-03; Vitest 1/1, Rust 9/9 |

## Decision

Only the negotiation/domain logic landed here. Deferring the socket server avoids duplicating the
connection lifecycle owned by feat-015 while leaving it a typed, tested API to call. Semantic
version parsing uses the standard library because the handshake only needs validated syntax and
the major number; adding a dependency would not reduce this feature's surface.
