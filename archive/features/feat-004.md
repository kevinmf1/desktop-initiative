# feat-004 — Tauri 2.x shell + navigation, real compile step in `verify.sh`

**Epic:** Desktop app (Tauri) · **By:** kevin-malik · **Closed:** 2026-08-03
**Requirement:** FR-000 (`specs/frontend/spec.md`) / SC-018 — the desktop builds, tests and
releases with none of the other three projects present.

## What landed

`desktop/` — scaffolded with `npm create tauri-app@latest -- --template react-ts` (Tauri 2.11,
React 19, Vite 7, TS 5.8), then trimmed to a shell:

- `src/App.tsx` — nav rail + header + placeholder body. Seven screens from `design/README.md`
  (Test Cases · Test Plans · Runner · Devices · Bugs · Reports · Log Inspector); each placeholder
  names the feature that will build it.
- `src/tokens.ts` — the Theme A "Clean Pro" tokens the shell uses, copied from
  `design/desktop-qa/uploads/QA-Tools (1)/qa-tokens.jsx`.
- `src/__tests__/App.test.tsx` — one Vitest/RTL test: every rail entry is reachable, exactly one
  is `aria-current="page"`, and the header follows.
- `src-tauri/` — Rust core, no commands yet (the greet sample was removed). Window 1440×900
  (min 1024×700), product `QA TestLab`, identifier `com.testlab.qa-desktop`.
- Scaffold cruft removed: `App.css`, `src/assets/`, `public/`, the Vite/Tauri/React logos.

## Deliberate simplifications

- **Text rail (200px), not the 60px icon rail** in `qa-ui.jsx`. `qa-icons.jsx` is 222 lines of SVG
  for screens that do not exist yet. Port it when the screens land.
- **`useState`, no router.** Seven screens, no URLs, no deep links. Add a router when something
  needs to link into a screen.
- **Theme A only.** Theme B "Dev Dark" has no mockup in any generation (`design/README.md`).

## Verification

```
$ ./verify.sh build   → HARNESS_VERIFY: PASS (build)
    spec structure OK: umbrella + frontend
    desktop compiles: webview + Rust core     (tsc && vite build; cargo check --all-targets)
$ ./verify.sh test    → HARNESS_VERIFY: PASS (test)
    contract copies consistent                (device-desktop-ws 2, sync-api 2, sdk-public-api 1)
    vitest: 1 test passed · cargo test: 0 tests, compiles clean
$ ./verify.sh lint    → HARNESS_VERIFY: PASS (lint)   (none configured)
```

Quickstart Scenario 0 (FR-000 / SC-018), run with no `backend/`, `ios/` or `android/` present:

- `npm --prefix desktop run build` — passes
- `cargo tauri build --no-bundle` — release binary built in 2m05s at
  `desktop/src-tauri/target/release/desktop`, so the app is releasable, not merely checkable
- shell rendered and all seven rail entries clicked through at `http://localhost:1420`

`npm run tauri dev` (the native window) was not automated — the webview was verified in a browser
and the Rust core through `cargo check` + the release build.

## Follow-on

`verify.sh` now prepends `$HOME/.cargo/bin` to `PATH`; rustup installs there and non-login shells
miss it. See `CONSTITUTION.md` § *Decisions*, 2026-08-03, which supersedes the 2026-07-31
"verify.sh checks specs, not a build" entry.
