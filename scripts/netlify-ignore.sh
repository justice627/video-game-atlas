#!/usr/bin/env bash
# Netlify "ignore" command: exit 0 skips the build, exit 1 builds.
# The Free plan has 300 credits a month as a hard limit (the site is paused when they run out),
# and every production deploy costs 15. So production builds run only when the scheduled deploy
# workflow (.github/workflows/deploy.yml) calls the build hook; pushes and merges to main build
# nothing. Deploy previews are free and always build.
set -u
if [ -n "${INCOMING_HOOK_TITLE:-}${INCOMING_HOOK_URL:-}" ]; then echo "build hook: build"; exit 1; fi
if [ "${CONTEXT:-production}" != "production" ]; then echo "context ${CONTEXT}: build (free)"; exit 1; fi
echo "production push without the build hook: skip (production ships on the deploy schedule)"; exit 0
