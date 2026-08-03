# design/ — visual reference

Not a deliverable. Mockups only, for matching the intended UI. Nothing here is binding —
`specs/frontend/` and `CONSTITUTION.md` win on any conflict.

## Canonical source — attach these

All under `design/desktop-qa/uploads/QA-Tools (1)/`:

| File | Use |
|---|---|
| `qa-tokens.jsx` | colors, spacing, type scale — attach first, always |
| `qa-ui.jsx` | shared primitives (buttons, badges, tables, rail) |
| `qa-icons.jsx` | icon set |
| `qa-test-cases.jsx` | Test Cases screen |
| `qa-test-plans.jsx` | Test Plans screen |
| `qa-runner.jsx` | Runner screen |
| `qa-log-inspector.jsx` | Log Inspector screen |
| `design-canvas.jsx` | how the screens compose |

Attach `qa-tokens.jsx` + `qa-ui.jsx` + the one screen you're building. Not the whole set.

To view it rendered:

```bash
open "design/desktop-qa/uploads/QA Tools Standalone (1).html"
```

That bundle is self-contained (React + all components embedded) and renders correctly.
`QA Tools - Design System (Standalone).html` in the same folder renders the token/component
sheet.

## Known-broken — do not attach

- `desktop-standalone.html` (2026-07-31) — newest by mtime, but **incomplete**. It is a gallery
  shell whose 14 `<iframe src="./<Screen>.dc.html">` targets were never bundled and do not exist
  anywhere in the repo. Renders as empty white/black thumbnails. Its only surviving information
  is the intended screen list and two themes:
  - screens: Test Cases · Test Plans · Runner · **Devices** · **Bugs** · **Reports** · Log Inspector
  - themes: **A · Clean Pro** (light surfaces, dark rail, blue accent) and **B · Dev Dark**
    (full dark, GitHub-inspired, high contrast)
  - Devices / Bugs / Reports have no mockup in any generation. Dev Dark has no mockup either.
    Both gaps need the original source from whoever authored the canvas — they cannot be
    reconstructed from this repo.

## Redundant

`desktop-qa.zip` is a byte copy of `design/desktop-qa/`. Inside `desktop-qa/uploads/` the
`QATools (1)/uploads/QA-Tools (1)/` tree duplicates `QA-Tools (1)/` — all eight `.jsx` files are
byte-identical between the two. Use the shallower path.

## Other files

- `mobile-sdk-qa.css`, `mobile-sdk-qa.html`, `mobile-sdk-figma.html` — the **mobile SDK** design.
  Another team's deliverable. Context only, never a target for this repo.
- `brand/testlab-logo-dark.svg`, `brand/testlab-icon.svg` — brand assets.
