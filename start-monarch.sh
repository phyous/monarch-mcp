#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER_DIR="$SCRIPT_DIR/monarch-mcp-server"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Source .env — try local repo root first, then main worktree
if [ -f "$REPO_ROOT/.env" ]; then
  set -a
  source "$REPO_ROOT/.env"
  set +a
else
  MAIN_WORKTREE="$(git -C "$REPO_ROOT" worktree list --porcelain | head -1 | sed 's/^worktree //')"
  if [ -f "$MAIN_WORKTREE/.env" ]; then
    set -a
    source "$MAIN_WORKTREE/.env"
    set +a
  else
    echo "Error: .env not found in $REPO_ROOT or $MAIN_WORKTREE" >&2
    exit 1
  fi
fi

# Auto-install deps if missing
if [ ! -d "$SERVER_DIR/node_modules" ]; then
  (cd "$SERVER_DIR" && pnpm install --frozen-lockfile) >&2
fi

# Auto-build if missing
if [ ! -d "$SERVER_DIR/dist" ]; then
  (cd "$SERVER_DIR" && pnpm run build) >&2
fi

exec node "$SERVER_DIR/dist/index.js"
