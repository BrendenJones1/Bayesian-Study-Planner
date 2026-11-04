#!/usr/bin/env bash
# Runs the same steps as .github/workflows/ci.yml, in the same order.
# Usage: scripts/ci-local.sh [--fix]   (--fix runs `ruff check --fix` first)
# Portable to macOS (bash 3.2, BSD grep) and Ubuntu.
set -e
cd "$(dirname "$0")/.."

step=""
trap 'rc=$?; if [ $rc -ne 0 ]; then echo "FAILED step: $step" >&2; fi; exit $rc' EXIT

fix=0
[ "$1" = "--fix" ] && fix=1

has_py=0
if [ -f priors/pyproject.toml ] || [ -f eval/pyproject.toml ]; then has_py=1; fi

if [ $fix -eq 1 ] && [ $has_py -eq 1 ]; then
  step="ruff check --fix"
  python -m pip install -q -r requirements-dev.txt
  ruff check --fix .
fi

if [ -f extension/package.json ]; then
  cd extension
  step="extension: npm ci"
  if [ -f package-lock.json ]; then npm ci; else npm install; fi
  step="extension: lint"; npm run lint --if-present
  step="extension: test"; npm test --if-present
  step="extension: build"; npm run build --if-present
  cd ..
fi

if [ $has_py -eq 1 ]; then
  step="python: pip install -r requirements-dev.txt"
  python -m pip install -r requirements-dev.txt
  for d in priors eval; do
    if [ -f "$d/pyproject.toml" ]; then step="python: pip install -e $d"; pip install -e "$d"; fi
  done
  step="python: ruff check ."; ruff check .
  step="python: pytest -q"
  rc=0; pytest -q || rc=$?
  if [ $rc -ne 0 ] && [ $rc -ne 5 ]; then exit $rc; fi # 5 = no tests collected
fi

if [ -n "$(ls -A extension/src 2>/dev/null)" ]; then
  step="guardrail: Canvas GET-only"
  if grep -rEn "method:[[:space:]]*['\"](POST|PUT|PATCH|DELETE)['\"]" extension/src/canvas 2>/dev/null; then
    echo "Canvas client must be GET-only (CLAUDE.md rule 2)" >&2; exit 1
  fi
  step="guardrail: host allowlist"
  hosts=$(grep -rhoE "https?://[a-zA-Z0-9.-]+" extension/src --exclude-dir=calendar 2>/dev/null | sort -u || true)
  bad=$(echo "$hosts" | grep -vE "canvas\.ubc\.ca|github\.io|www\.w3\.org|localhost|127\.0\.0\.1|^$" || true)
  cal_hosts=$(grep -rhoE "https?://[a-zA-Z0-9.-]+" extension/src/calendar 2>/dev/null | sort -u || true)
  cal_bad=$(echo "$cal_hosts" | grep -vE "www\.googleapis\.com|accounts\.google\.com|www\.w3\.org|localhost|127\.0\.0\.1|^$" || true)
  bad=$(printf '%s\n%s\n' "$bad" "$cal_bad" | grep -v '^$' || true)
  if [ -n "$bad" ]; then
    echo "Unexpected hosts in extension/src (CLAUDE.md rule 1):" >&2; echo "$bad" >&2; exit 1
  fi
fi
echo "ci-local: all steps passed"
