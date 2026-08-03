# Specification Quality Checklist: QA Test Management Platform (Desktop + Backend + iOS SDK + Android SDK)

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-07-06 · **Last revised**: 2026-07-28 (v3)
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs) — *with one deliberate, quarantined exception: see Notes*
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain — *and the `## Open Questions` section is now empty; all four resolved in the 2026-07-28 clarify session*
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

### v3 revision (2026-07-28)

- Driven by direct user instruction, not by new source documents. Six changes: four-project split, Go/Go-workspace backend, SwiftUI+UIKit iOS support, `design/mobile-sdk-qa.html` as the SDK feature authority, action-grouped log inspection, and screenshot/screen-recording capture (session-linked and standalone).
- **Deliberate exception to "no implementation details"**: the user mandated specific technologies (Tauri, Go workspace, Swift, Kotlin, PostgreSQL). Rather than launder these into vague prose or drop them, they are quarantined in a single `## Technical Constraints` section flagged as fixed inputs for `/speckit-plan`. The User Scenarios, Functional Requirements, Key Entities, and Success Criteria sections remain technology-agnostic — FR-000..FR-000c express the four-project split in terms of testable properties (independently buildable, versioned contracts, dependency-manager consumable) rather than naming tools.
- **v2 exclusions reversed**: app-log/logcat capture and crash capture were explicitly *out* of scope in v2 because the uploaded requirement docs did not mention them. `design/mobile-sdk-qa.html` shows both as first-class features, and the user named that file as the SDK's feature authority — so FR-037/FR-038 bring them back in. Also newly in scope from the design: on-device session history with rename/delete/read-only replay, cURL export, sort/filter, theme toggle, and the draggable edge-snapping FAB.
- **The `## Open Questions` section is now empty.** The two questions raised at spec time (user-action detection; recording/library caps) plus two more surfaced during scanning (media durability; contract-version policy) were all resolved in the `/speckit-clarify` session below.

### `/speckit-clarify` session (2026-07-28) — 5 questions

Two answers overrode the recommendation, and both changed the spec materially rather than confirming it:

1. **Media durability** → device → desktop → backend object storage. Added FR-044/044a/044b, TC-005a, three edge cases (queued upload, interrupted transfer, post-upload eviction), SC-013a, and an upload-state field on Screen Capture. Note the ordering constraint this creates: a Bug's record syncs independently of its binary, so "bug synced" never implies "evidence viewable".
2. **User-action detection** → **automatic only** (recommendation was automatic + optional host labels). FR-039f was *inverted*: it now forbids a host-facing labelling API rather than requiring one. FR-039h/039i added to pin down automatic detection and the label-derivation order (accessibility label → visible text → view identifier → position). Consequence recorded in Assumptions: label quality is bounded by the host app's accessibility hygiene, and SC-010's 95% attribution figure is a ceiling, not a floor.
3. **Contract versioning** → semver with additive-only minors, capability negotiated at handshake, major mismatch refuses. Added FR-000d/000e, three edge cases, SC-019/020. This is what makes the four-project split actually independent.
4. **Capture limits** → 5 min per recording, 500 MB library, both host-configurable. Added FR-045a, FR-047a (refuse to start rather than evict protected evidence).

**Post-session scope change**: screen recording was subsequently **downgraded to optional and exploratory** at the user's request. Screenshots remain a committed MVP requirement; recording is gated behind spike **EX-001** in the spec's new `## Exploration Required` section, and FR-041/045/045a/047a, US5 scenarios 6–7, and SC-013 are marked conditional on its outcome. The Q4 limits above now read as "if recording ships". Two consequences to watch: recording must not block any other requirement, and if the spike fails the SDK ships **no** recording control rather than a visible-but-inert one (per FR-050b).
5. **SDK OS floor** → **iOS 13 / Android 6 (API 23)** (recommendation was iOS 15 / Android 8). Added FR-050..050c and SC-018a. Two knock-on effects worth watching at plan time: the full core capture set must work at those floors, not just on current OS releases, so the device test matrix is wider than a modern-only floor would need; and FR-050c makes raising either floor a **major** contract bump, since it can strand a host app that cannot upgrade.

### Carried forward from v2

- `QATools.zip`'s `uploads/*.md` documents remain authoritative for desktop and backend business rules. Where they conflict with `design/mobile-sdk-qa.html` on SDK features, the design HTML now wins (v3 user instruction).
- The zip's mockup JSX/screenshots are secondary corroboration for presentation/flow only; UI details they imply but the written docs do not mandate (e.g. a fixed two-column dual-device runner layout) were intentionally left out of this business-facing spec — revisit during `/speckit-plan`.
- `/speckit-clarify` (2026-07-06) resolved 6 items: MVP auth deferral, Test Case status enum + Active/Archived flag, Bug severity P0–P3, Test Case platform as iOS/Android/Both with no build-version field, MVP single-admin role, and Android SDK confirmed as MVP scope (overriding the uploaded roadmap's iOS-only framing).
- `/speckit-clarify` (2026-07-10) resolved 5 more: derived Test Case summary status, Bug status enum, API-logs-are-live-working-data vs bugs-are-durable, ±30s default evidence window, and 5-minute single-use pairing token TTL.

### Downstream status

- **Resolved 2026-07-28.** `plan.md`, `research.md`, `data-model.md`, `quickstart.md`, and all three `contracts/*.md` were regenerated by `/speckit-plan` against this v3 spec. The backend is now a Go workspace (3 modules), the SDK contract covers SwiftUI/UIKit dual-host, action grouping, app-log/crash capture and screen capture, and the WS contract carries action-attributed records plus version negotiation.
- Planning surfaced two spec-vs-platform tensions, resolved in `research.md` rather than coded around (Principle V): `OSLogStore` is iOS 15+ so it cannot be the primary app-log mechanism at the iOS 13 floor (R12), and `PixelCopy` is API 24+ so it cannot be the primary screenshot mechanism at API 23 (R15). Both are now enhancements over a floor-compatible baseline — FR-050a holds.
- `tasks.md` does not exist yet — next step is `/speckit-tasks`. It must **not** emit implementation tasks for screen recording, only the EX-001 spike.

### Scope addition — multi-workspace users + Google SSO (2026-07-28, post-plan)

Prompted by a review of `data-model.md`: `User` carried a `workspace_id` FK, making multi-workspace membership structurally impossible. Corrected, and authentication pulled forward from post-MVP.

- **User is now global**; `Workspace Membership` (unique on workspace+user, role always `admin`) is the sole access path. FR-001a rewritten; FR-056…056d added.
- **Google SSO is MVP scope**, replacing the "no enforced login" assumption. FR-051…055 added. **FR-001b was amended** — it previously required both email/password *and* SSO; email/password is now explicitly out of scope, with the Identity model kept provider-generic so it stays additive.
- **Identity keys on the provider's stable subject, never email** — otherwise a user changing their Google address either splits into two accounts or silently merges with someone else (SC-024).
- **Constitution Delta D3** recorded in the plan: auth is the product's first hard backend dependency and would have broken Principle III / SC-005 if checked per launch. Resolved with a cached session + 30-day offline grace (R20), making sign-in the only connectivity-dependent moment. Accepted cost, recorded not buried: **revocation is not instantaneous** offline.
- FR-002's deferral of a real role system **stands** — the role column exists but every member is `admin`.
- Mobile SDKs are unaffected and hold no user identity (FR-055).
- New: SC-021…024, quickstart Scenarios A and B, research R19–R21, `core/auth.go` + `handlers_auth.go`, `401`/`403` in the sync contract.
