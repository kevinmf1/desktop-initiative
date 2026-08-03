# Constitution — desktop-initiative

> **Binding.** This file owns every rule in the project. `AGENTS.md` describes *how to work*;
> this file defines *what is always true*. On any conflict, this file wins.
> Never archived, always in context. Changing a rule is a deliberate amendment — date it.

## Invariants — scope

- **This repo delivers the frontend (Tauri desktop) only.** The Go backend, iOS SDK and Android
  SDK are other people's projects. Do not create `specs/backend/`, `specs/ios/` or
  `specs/android/` here, and do not treat their absence as a gap to close — `specs/README.md`
  declares them because it is the shared product index, not this repo's work list.
- Work that belongs to another project is **not** a drive-by edit and **not** a new `FEATURES.md`
  row. It is somebody else's row, in somebody else's repo.

## Invariants — architecture

- `specs/001-test-management-platform/` is the **single source of truth**. `specs/frontend/` is a
  scoped derivation of it. A change to shared meaning is made in the umbrella first, then
  propagated — never the other way round.
- The **Product Context** section in `specs/frontend/README.md` is duplicated verbatim from the
  umbrella so the folder stands alone. Editing one copy and not the other is the drift this rule
  exists to prevent.
- A contract file duplicated into `specs/frontend/contracts/` must be **byte-identical** to the
  umbrella's copy. `./verify.sh test` enforces this; a diverged copy means we are building
  against a different spec than our peers.
- The desktop participates in exactly two contracts: **`device-desktop-ws`** (desktop is the
  **server**) and **`sync-api`** (desktop is the **client**). `sdk-public-api` is the SDKs' and is
  not ours to change.
- The four projects share **no source**. Integration is only over those published contracts.
- Contracts are semver'd independently: same major → peers connect; minors are additive (a peer
  ignores what it doesn't recognise); major mismatch → refuse and name the out-of-date side.
  A capability an older peer lacks is shown *unavailable-because-out-of-date* — never silently
  absent, never silently degraded.

## Invariants — platform

- This repo carries **no build toolchain and no product code** — Markdown only. `./verify.sh`
  checks spec structure and contract-copy consistency, nothing more. Replace `run_build` with a
  real compile step the moment code lands here.
- Binding target for our project: **Tauri 2.x** (Rust core + React/TS webview), macOS 12+ /
  Windows 10+ / Linux. The peers' floors (Go 1.24 + PostgreSQL 16, iOS 13+, Android API 23+)
  matter only where a contract's wire behaviour depends on them.
- Git is initialised, `HEAD` is on `main`, and `main` is **unborn** until the first commit — so
  `git diff --stat` shows everything as untracked until then. See
  [archive/features/feat-003.md](archive/features/feat-003.md).

## Prohibitions — code

- Never edit `specs/frontend/`'s copy of a contract or the Product Context in isolation — fix the
  umbrella copy in the same change, or the duplication silently rots.
- Never change `sdk-public-api` or another project's contract expectations unilaterally. A wire
  change is a coordinated, semver'd negotiation with the peers, not an edit.
- Never introduce a shared library, shared module, or cross-project import between the four
  projects. Duplication across contracts is the deliberate design (TC-001).
- Never spec a desktop capability that leaks unredacted data. The desktop **re-scans defensively
  and never treats that as the gate** — redaction at source (SDKs) and the backend's 422 are the
  real gates (TC-003, Principle I).
- Never make the device → desktop hot path depend on the backend or the network (Principle III).

## Prohibitions — process

- **Never auto-commit.** Update files, report what changed, let the user decide.
- Never mark a feature ✅ without evidence recorded in `FEATURES.md`.
- One feature active at a time per person (see your `state/<name>.md`). Out-of-scope ideas
  become new `FEATURES.md` rows, not drive-by edits.

## Git

- Base branch for PRs: `main`. Feature branches: `feature/<topic>`.
- **Commit messages are prefixed with the feature ID:** `feat-042: <summary>`.
  This lets `git log --grep="<id>"` corroborate the `By` column in `FEATURES.md` — markdown
  gives attribution at a glance, git proves it.
- **State is one file per person:** `state/<git config user.name>.md`. You write only your own
  file; nobody else ever touches it. Because git only conflicts when two branches change the
  *same lines of the same file*, this makes **merge, rebase and cherry-pick conflict-free by
  construction** — no merge strategy, no `.gitattributes`, no per-developer setup to forget.
- **Cross-person visibility lives in `FEATURES.md`, not in state files.** `FEATURES.md` merges
  normally and shows every in-flight feature with its `By` owner. Your state file answers only
  "what am *I* doing right now." Keep a short **In flight elsewhere** note when a teammate
  picks up work you care about.
- Attribution (`By` columns, journal authors) comes from `git config user.name` on the machine
  running the session — never from the agent, so it works identically for any tool.

---

## Decisions

_Dated entries. Add one whenever an arguable choice gets settled — include the reasoning, so
it can be reopened later without redoing the analysis. Amend by adding a new dated entry that
supersedes the old one; never silently edit history._

### 2026-08-03 · This repo is frontend-only; `specs/README.md` is not our work list

`specs/README.md` indexes all four projects and declares `backend/`, `ios/`, `android/`. Read as a
work list it produces exactly one wrong conclusion — that the missing folders are gaps to close —
and that conclusion was in fact reached and acted on earlier in this session before being reverted.

It is a **shared product index**, not this repo's scope. We deliver the **frontend (Tauri desktop)**
only. So: `verify.sh` checks `umbrella + frontend` and nothing else, and the missing stack folders
are **correct**, not incomplete. Chosen over checking all four (which fails permanently on work we
will never do) and over editing `specs/README.md` to drop them (it is the peers' index too, and
trimming it would break *their* folders' self-containment).

### 2026-07-31 · verify.sh checks specs, not a build

There is no code in this repo, so a compile check would be invented verification — worse than
none. `build` asserts the structure `specs/README.md` promises; `test` asserts duplicated
contract copies are byte-identical. Both are real failures with real causes. Chosen over leaving
`verify.sh` TODO-marked, which would make every ✅ unfalsifiable.

<!-- ### YYYY-MM-DD · <short title>
     <the rule, then why it was chosen over the alternative> -->
