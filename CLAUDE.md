# video-game-atlas

A world map and timeline of video games set in real places. Static site (Vite + MapLibre) built from CSV tables in `data/`.

## Authority

- `docs/data-rules.md` decides what data is valid. If a case doesn't fit, propose a rule change; never bend the data to pass.
- `validate()` in `scripts/lib/dataset.ts` enforces the rules. Errors name the table and row.
- The pipeline design and its phases: `docs/plans/pipeline.md`.

## Hard rules

1. Never route around a blocked source: no other user agents, proxies, headless browsers, paywall or login workarounds. Log it and move on.
2. Never edit a link whose status is `verified`. Propose the change for review instead.
3. Code, config, workflows and rules go to a PR against `main`; the owner merges. Data follows the gate.
4. Never fake a quote, loosen a rule or skip a check to get unblocked. Log the blocker and continue with what doesn't depend on it.

## Commands

```bash
npm test                  # unit tests, including validation and golden examples
npm run build:data        # validate and build public/atlas.json
npm run test:e2e          # browser tests against the production build
npm run golden:update     # after a deliberate rule change; say in the PR which golden files moved
npm run data:export       # local Excel editing view (gitignored); data:import writes it back
```

## Style

Small TypeScript scripts run with `tsx`; no new runtime dependencies without a reason in the PR. American English in docs.
