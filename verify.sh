#!/bin/bash
# Harness verification for desktop-initiative. Run from repo root.
# Usage: ./verify.sh [build|test|lint|all]   (default: build)
# Always ends with a machine-parseable line: HARNESS_VERIFY: PASS|FAIL
#
# "build" checks the spec structure this repo is responsible for, then compiles desktop/
# (TypeScript + Vite for the webview, cargo check for the Rust core). "test" checks the
# duplicated contract copies have not drifted, then runs the webview and Rust core tests.
#
# The desktop must build and test with no other project present (FR-000 / SC-018), so every
# command below runs inside desktop/ only.
#
# SCOPE: this repo owns the FRONTEND (Tauri desktop) only. specs/README.md also declares
# backend/, ios/ and android/ — those are other people's projects and are deliberately NOT
# checked here. Do not add them back without also taking on their delivery.
set -eo pipefail

# rustup installs here and non-login shells often miss it.
export PATH="$HOME/.cargo/bin:$PATH"

MODE="${1:-build}"

fail() { echo "HARNESS_VERIFY: FAIL ($1)"; exit 1; }

need() { command -v "$1" >/dev/null || fail "$1 not found — see specs/frontend/quickstart.md"; }

# npm ci is 10s of wasted wall clock on every run; only install when node_modules is absent.
npm_deps() {
  need npm
  [ -d desktop/node_modules ] || (cd desktop && npm install --silent) || fail "npm install"
}

REQUIRED_DOCS="spec.md plan.md research.md data-model.md quickstart.md"
STACKS="frontend"

run_build() {
  local missing=0
  for d in $REQUIRED_DOCS; do
    [ -f "specs/001-test-management-platform/$d" ] || { echo "missing: specs/001-test-management-platform/$d" >&2; missing=1; }
  done
  for s in $STACKS; do
    if [ ! -d "specs/$s" ]; then
      echo "missing stack folder: specs/$s (declared in specs/README.md)" >&2
      missing=1
      continue
    fi
    for d in $REQUIRED_DOCS README.md; do
      [ -f "specs/$s/$d" ] || { echo "missing: specs/$s/$d" >&2; missing=1; }
    done
  done
  [ "$missing" -eq 0 ] || fail "spec structure incomplete"
  echo "spec structure OK: umbrella + $STACKS"

  npm_deps
  (cd desktop && npm run build) || fail "desktop webview build (tsc + vite)"
  need cargo
  (cd desktop/src-tauri && cargo check --all-targets) || fail "desktop Rust core (cargo check)"
  echo "desktop compiles: webview + Rust core"
}

# Each contract is duplicated into every stack folder that participates in it.
# Copies must be byte-identical, or the peers are building against different specs.
run_test() {
  local drift=0 found=0
  for contract in device-desktop-ws sync-api sdk-public-api; do
    local ref="" n=0
    for f in specs/*/contracts/"$contract".md; do
      [ -f "$f" ] || continue
      n=$((n + 1))
      if [ -z "$ref" ]; then
        ref="$f"
      elif ! cmp -s "$ref" "$f"; then
        echo "contract drift: $f differs from $ref" >&2
        drift=1
      fi
    done
    [ "$n" -gt 0 ] && found=1
    echo "  $contract: $n cop$([ "$n" -eq 1 ] && echo y || echo ies)"
  done
  [ "$found" -eq 1 ] || fail "no contracts found"
  [ "$drift" -eq 0 ] || fail "contract copies diverged"
  echo "contract copies consistent"

  npm_deps
  (cd desktop && npm test) || fail "desktop webview tests (vitest)"
  need cargo
  (cd desktop/src-tauri && cargo test) || fail "desktop Rust core tests (cargo test)"
}

run_lint() {
  echo "No lint check configured for this project."
}

case "$MODE" in
  build) run_build ;;
  test)  run_test ;;
  lint)  run_lint ;;
  all)   run_build && run_test && run_lint ;;
  *)     echo "Unknown mode: $MODE (use build|test|lint|all)"; exit 2 ;;
esac

echo "HARNESS_VERIFY: PASS ($MODE)"
