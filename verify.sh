#!/bin/bash
# Harness verification for desktop-initiative. Run from repo root.
# Usage: ./verify.sh [build|test|lint|all]   (default: build)
# Always ends with a machine-parseable line: HARNESS_VERIFY: PASS|FAIL
#
# ponytail: this is a specs-only repo — there is nothing to compile. "build" checks the
# spec structure this repo is responsible for; "test" checks duplicated contracts have not
# drifted. Replace run_build with a real compile step once desktop/ product code lands here.
#
# SCOPE: this repo owns the FRONTEND (Tauri desktop) only. specs/README.md also declares
# backend/, ios/ and android/ — those are other people's projects and are deliberately NOT
# checked here. Do not add them back without also taking on their delivery.
set -eo pipefail

MODE="${1:-build}"

fail() { echo "HARNESS_VERIFY: FAIL ($1)"; exit 1; }

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
