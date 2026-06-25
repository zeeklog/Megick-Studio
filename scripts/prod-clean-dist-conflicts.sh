#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  bash scripts/prod-clean-dist-conflicts.sh [--deploy] [--no-pull]

Fixes production git pull conflicts caused by locally generated build outputs
under apps/api/dist and apps/web/dist.

Options:
  --deploy   Run "pnpm build && pm2 reload ecosystem.config.cjs" after cleanup/pull.
  --no-pull  Only clean the local dist conflict state; do not run git pull.
EOF
}

DO_PULL=1
DO_DEPLOY=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --deploy)
      DO_DEPLOY=1
      ;;
    --no-pull)
      DO_PULL=0
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

if ! ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"; then
  echo "ERROR: run this script inside the megick-ai-creations git repository." >&2
  exit 1
fi

cd "$ROOT"

DIST_PATHS=("apps/api/dist" "apps/web/dist")
MERGE_HEAD="$(git rev-parse --git-path MERGE_HEAD)"

echo "[clean-dist] Repository: $ROOT"

if [[ -f "$MERGE_HEAD" ]]; then
  echo "[clean-dist] Aborting the failed merge from the previous git pull."
  git merge --abort
fi

NON_DIST_CHANGES="$(
  git status --porcelain --untracked-files=no |
    awk '$2 !~ /^apps\/(api|web)\/dist\// { print }'
)"

if [[ -n "$NON_DIST_CHANGES" ]]; then
  echo "ERROR: non-dist tracked changes exist. Leaving them untouched:" >&2
  printf '%s\n' "$NON_DIST_CHANGES" >&2
  echo "Commit/stash those changes first, then rerun this script." >&2
  exit 1
fi

for path in "${DIST_PATHS[@]}"; do
  if git ls-files -- "$path" | grep -q .; then
    echo "[clean-dist] Restoring tracked files in $path from HEAD."
    git restore --staged --worktree -- "$path"
  fi

  if [[ -e "$path" ]]; then
    echo "[clean-dist] Removing ignored generated files in $path."
    git clean -fdX -- "$path"
  fi
done

if [[ "$DO_PULL" -eq 1 ]]; then
  echo "[clean-dist] Pulling latest code with fast-forward only."
  git pull --ff-only
fi

if [[ "$DO_DEPLOY" -eq 1 ]]; then
  echo "[clean-dist] Building and reloading PM2."
  pnpm build
  pm2 reload ecosystem.config.cjs
fi

echo "[clean-dist] Done."
