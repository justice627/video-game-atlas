#!/usr/bin/env bash
# Netlify "ignore" command: exit 0 skips the build, exit 1 builds.
# Netlify allows about 20 production deploys a month on the free plan, so merges that
# change only data, docs or review files skip production; the scheduled data deploy
# (a build hook, Monday and Thursday) ships them. Previews and hook builds always run.
set -u
[ -n "${INCOMING_HOOK_TITLE:-}${INCOMING_HOOK_URL:-}" ] && { echo "build hook: build"; exit 1; }
[ "${CONTEXT:-production}" != "production" ] && { echo "context ${CONTEXT}: build"; exit 1; }
[ -z "${CACHED_COMMIT_REF:-}" ] || [ "${CACHED_COMMIT_REF}" = "${COMMIT_REF:-}" ] && { echo "no previous deploy to compare: build"; exit 1; }
changed=$(git diff --name-only "$CACHED_COMMIT_REF" "${COMMIT_REF:-HEAD}" 2>/dev/null) || { echo "cannot diff: build"; exit 1; }
other=$(printf '%s\n' "$changed" | grep -v -E '^(data/|docs/|review/)' | grep -v '^$')
if [ -z "$other" ]; then echo "only data/docs/review changed: skip production build"; exit 0; fi
echo "code or config changed: build"; printf '  %s\n' $other; exit 1
