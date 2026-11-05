#!/usr/bin/env bash
# Claude Code PostToolUse hook (Edit|Write). Cheap filter first: only data tables start Node.
input=$(cat)
case "$input" in
  *'"file_path":"'*'/data/'*'.csv"'*|*'"file_path": "'*'/data/'*'.csv"'*) ;;
  *) exit 0 ;;
esac
cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}" || exit 0
printf '%s' "$input" | exec node --import tsx scripts/hooks/check-data.ts
