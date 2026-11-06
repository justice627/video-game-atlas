#!/usr/bin/env bash
# PreToolUse guard for the research subagents; see guard-agent.ts. Optional $1 names the agent
# (frontmatter hooks); otherwise agent_type from the hook input decides, and other agents pass.
input=$(cat)
if [ -z "${1:-}" ]; then
  case "$input" in *'"agent_type":"researcher"'*|*'"agent_type": "researcher"'*|*'"agent_type":"fact-checker"'*|*'"agent_type": "fact-checker"'*) ;; *) exit 0 ;; esac
fi
cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}" || exit 0
printf '%s' "$input" | exec node --import tsx scripts/hooks/guard-agent.ts "${1:-}"
