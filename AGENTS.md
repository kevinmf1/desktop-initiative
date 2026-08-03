# AGENTS.md

desktop-initiative — **this repo delivers the frontend (Tauri desktop) only.** It is one of four
projects in the QA Test Management Platform; the Go backend, iOS SDK and Android SDK are other
people's, built from their own copies of the umbrella spec. No product code lives here yet —
`specs/frontend/` is the deliverable.
Router for agent work. Facts live in the linked docs; this file is the map, not the manual.

## Session startup

1. Load the `edts-harness` skill first, every session.
2. Read **your** state file — resolve it with:
   `echo "state/$(git config user.name | tr "[:upper:] " "[:lower:]-").md"`
   It's the only state file you read in full: active feature, last verify
   result, blockers, next step. Never write to anyone else's state file.
3. Read `CONSTITUTION.md` — the permanent rules and past decisions. Always in context.
4. Run `./verify.sh build` to confirm a clean baseline before editing.
5. Pick the **one** ready feature from `FEATURES.md` (all its `Depends on` are ✅).
   Set its status to 🔵 and start.

## Project overview

- **Stack:** Markdown specs only. No build toolchain, no package manifest.
- **Structure:**
  - `specs/frontend/` — **our deliverable**: the Tauri desktop spec set (self-contained)
  - `specs/001-test-management-platform/` — canonical umbrella spec, **single source of truth**
  - Each carries `spec.md plan.md research.md data-model.md quickstart.md` + its `contracts/`
- **Out of scope:** `specs/README.md` also declares `backend/`, `ios/`, `android/`. Those are the
  other three projects and are **not ours to create**. Their absence is correct, not a gap —
  `verify.sh` deliberately does not check for them.
- **Contracts:** the desktop participates in two — `device-desktop-ws` (desktop is **server**) and
  `sync-api` (desktop is **client**). `sdk-public-api` is the SDKs'. Every copy of a contract must
  stay byte-identical to the umbrella's.
- **Docs:** `specs/README.md` (product context), `CONSTITUTION.md` (rules), `FEATURES.md` (scope).
- **Design:** `design/README.md` says which mockup files to attach for a UI feature and which are
  broken. Read it before any UI work; never attach a `design/*.html` bundle as context.

## Verification

Run before claiming any work done. All checks must pass.

```bash
./verify.sh build
```

`verify.sh` prints a final `HARNESS_VERIFY: PASS` / `FAIL` line — that line is your evidence.
Only checks this project actually has are listed. Do not invent lint/test/e2e steps.

## Definition of done

A feature is `✅` only when: its `Done when` criteria are met, `verify.sh` passes, evidence is
recorded in its `FEATURES.md` sub-table, and your state file is updated with the next step.

## Session handoff

- Keep your state file current in real time — flip status the moment it changes.
- After every edit, append to its `Changes` table (file · what · why).
- Before ending: run verify, record the result, leave your state file resumable on its own.
- When a feature closes, rotate its detail to `archive/features/<id>.md` and replace its
  Evidence cell with a link. Same for sessions and completed epics. Write the archive file
  *first*, then remove the detail — the other order loses the evidence if interrupted.

---

## Rules

**All binding rules live in `CONSTITUTION.md`** — architecture, platform constraints, code
prohibitions, process, and git. It is binding, not advisory: read it at startup (step 3),
and if anything in this file appears to conflict with it, **`CONSTITUTION.md` wins.**

Rules are deliberately not repeated here. One home, no drift.
