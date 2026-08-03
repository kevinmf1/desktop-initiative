# State — kevin-malik

> Your personal working state. One file per person (`state/<git config user.name>.md`),
> so merge / rebase / cherry-pick never conflict — nobody else ever writes here.
> Keep it small — cap ~100 lines. Finished work rotates to `archive/`.
> Team-wide view of who's doing what lives in `FEATURES.md`, not here.

## Now

- **Objective:** Harness ready and correctly scoped to the **frontend (Tauri desktop) only**.
- **Active feature:** — (none; Harness setup epic is closed)
- **Status:** harness green, nothing committed yet (`main` is unborn — first commit is yours to make)
- **Last verify:** 2026-08-03 · `build` → **PASS** (umbrella + frontend) ·
  `test` → **PASS** (device-desktop-ws 2 copies, sync-api 2 copies, sdk-public-api 1) ·
  `lint` → not configured

## Next step

Pick the first real frontend feature and add it to `FEATURES.md` as a new epic. The spec set in
`specs/frontend/` is complete, so the next work is desktop implementation, not more spec writing.

## Parked

- None.

## In flight elsewhere

- Backend, iOS SDK, Android SDK are **other people's projects** — not tracked here.

## Blockers

- None.

## Changes (this session)

| File | Change | Why |
|------|--------|-----|
| AGENTS.md | Filled project overview; skill name `harness-kit` → `edts-harness` | Was TODO-marked; skill reinstalled under its real name |
| CONSTITUTION.md | Real invariants + one dated decision | Stack defaults only, before |
| FEATURES.md | Seeded epic, then rescoped to frontend | Placeholder replaced; backend/iOS rows withdrawn |
| verify.sh | Spec-structure + contract-drift checks | Generated version was a TODO that always failed |
| .gitignore, git repo | `git init -b main`, ignore `.DS_Store` | feat-003 |
| archive/features/feat-003.md | Closed-feature evidence | Rotation |
| .claude/settings.local.json | Dropped 3 allow-entries for the removed `harness-kit` path | Dead permissions |
| state/kevin-malik.md | This file | Session state |

### Scope correction — 2026-08-03

Earlier in this session I derived `specs/backend/` and started `specs/ios/` as feat-001/feat-002,
reading `specs/README.md`'s four-project index as this repo's work list. **It is not** — this repo
delivers the frontend only. Those folders are gone and the harness now enforces the narrower scope
(`verify.sh` `STACKS="frontend"`, `CONSTITUTION.md` § *Invariants — scope*). IDs feat-001/002 are
retired, not reusable.

_Ground truth: `git diff --stat` — everything shows as untracked until the first commit._
