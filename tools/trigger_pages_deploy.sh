#!/usr/bin/env bash
set -euo pipefail

fail() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

for command_name in git gh; do
  command -v "$command_name" >/dev/null 2>&1 || fail "missing command: $command_name"
done

repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || fail "not inside a Git repository"
cd "$repo_root"

[[ -x .venv/bin/mkdocs ]] || fail "missing .venv/bin/mkdocs"
gh auth status --hostname github.com >/dev/null || \
  fail "run: gh auth login --hostname github.com --git-protocol https --web"

branch="$(git branch --show-current)"
[[ "$branch" == "main" ]] || fail "switch to main before deploying"

git fetch --quiet origin main
local_sha="$(git rev-parse HEAD)"
remote_sha="$(git rev-parse origin/main)"
[[ "$local_sha" == "$remote_sha" ]] || \
  fail "local main must exactly match origin/main; commit and push first"
[[ -z "$(git status --porcelain --untracked-files=normal)" ]] || \
  fail "working tree is dirty; uncommitted files are never deployed"

.venv/bin/python -m unittest discover -s tools -p 'test_*.py'
.venv/bin/mkdocs build --clean --strict

repo="$(gh repo view --json nameWithOwner --jq '.nameWithOwner')"
gh workflow view deploy.yml --repo "$repo" >/dev/null

previous_id="$(
  gh run list \
    --repo "$repo" \
    --workflow deploy.yml \
    --branch main \
    --event workflow_dispatch \
    --commit "$remote_sha" \
    --limit 1 \
    --json databaseId \
    --jq '.[0].databaseId // empty'
)"

printf 'Triggering deploy.yml for %s at %s...\n' "$repo" "$remote_sha"
printf 'Note: the workflow cancels an older Pages deployment if one is still running.\n'
gh workflow run deploy.yml --ref main --repo "$repo"

run_id=""
run_url=""
for _ in $(seq 1 30); do
  row="$(
    gh run list \
      --repo "$repo" \
      --workflow deploy.yml \
      --branch main \
      --event workflow_dispatch \
      --commit "$remote_sha" \
      --limit 1 \
      --json databaseId,url \
      --jq 'if length == 0 then "" else (.[0] | [.databaseId, .url] | @tsv) end'
  )"
  if [[ -n "$row" ]]; then
    run_id="${row%%$'\t'*}"
    run_url="${row#*$'\t'}"
    [[ "$run_id" != "$previous_id" ]] && break
  fi
  run_id=""
  sleep 2
done

[[ -n "$run_id" ]] || fail "dispatch succeeded but the new run was not found"
printf 'Run: %s\n' "$run_url"
gh run watch "$run_id" --repo "$repo" --exit-status
printf 'Deployment succeeded: %s\n' "$run_url"
