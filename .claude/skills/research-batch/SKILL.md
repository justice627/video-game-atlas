---
name: research-batch
description: Run one research batch for the atlas - apply review decisions, discover candidates, research the next N games with the researcher and fact-checker subagents, gate the results and commit a data-only branch. Use for the scheduled daily run or when asked to research a batch.
argument-hint: "[n=5]"
---

# Research batch

Research up to **$ARGUMENTS** games (5 if empty). Follow these steps in order. The scripts do the bookkeeping; you run them, call the two subagents, and read their results. Read `CLAUDE.md` first: its hard rules apply to every step.

**Never stall on one game.** If a game fails twice at any step, run `npm run pipeline -- abandon <game> "<what failed>"` and go on to the next one. **Never route around a blocked source.** **Never edit a verified link.**

## 0. Start clean from main

```bash
git status --porcelain            # must be empty; if not, stop and report
git fetch origin main && git checkout --detach origin/main
npm ci
export RUN_ID=$(date -u +%Y-%m-%d-%H%M)
```

## 1. Apply queue decisions

```bash
npm run pipeline -- apply-decisions
```

Decisions that couldn't be applied stay in the queue; list them in your final report.

## 2. Discover

```bash
npm run pipeline -- discover
```

## 3. Backpressure

```bash
npm run pipeline -- backpressure
```

If it prints `discover-only`, skip to step 6: research nothing new while 40 or more items wait for review.

## 4. Pick

```bash
npm run pipeline -- pick <n>
```

This prints the games as JSON, in order: `data/queue-in.csv`, the research backlog, games whose sources were unblocked, then candidates with the most specific leads. Frozen roles and series (`data/freeze.csv`) are already left out.

## 5. Each game, one at a time

For each picked game:

1. **Research.** Call the `researcher` subagent with the pick's JSON line, the game id to use (the pick's `id` if it is lowercase-with-dashes, else one made from the title), and today's date. Note the tokens the Agent tool reports.
2. **Merge.** `npm run pipeline -- merge-staging <game-id>`. If it refuses, send the errors back to the researcher once to fix the staging files, then merge again. If it still fails, abandon the game.
3. **Fetch evidence.** `npm run verify:sources -- --fetch --changed`. Blocked or failed fetches are logged for review; that's expected, carry on.
4. **Fact-check.** Call the `fact-checker` subagent with only the game id, nothing about the research. Save the JSON block from the end of its reply to a file in your scratchpad, then `npm run pipeline -- record-factcheck <game-id> <file>`. If its reply has no valid JSON, ask it once more for just the JSON; if that fails too, record `{"verdict": "object", "objections": [{"link": "<any draft link id>", "rule": "process", "note": "fact-checker gave no verdict"}]}`.
5. **Gate.** `npm run gate -- --apply --game <game-id>`.
6. **Tokens.** `npm run pipeline -- log $RUN_ID tokens <researcher + fact-checker tokens> <game-id>`.

## 6. Queue

```bash
npm run queue:build
```

This rebuilds `review/queue.csv` from the link statuses, audits and blocked sources. The pinned "Review queue" issue updates itself when the data PR merges.

## 7. Check and commit

```bash
npm test
npm run verify:sources -- --offline
npm run pipeline -- commit $RUN_ID
```

`commit` refuses if anything outside `data/`, `docs/research/`, `docs/review/` or `review/` changed. If tests fail, find the data row that breaks them and abandon that game rather than editing rules or tests. If the push fails, report the branch name and the error; don't push anywhere else.

## Final report

Short: games researched, what auto-verified, what was queued and why, what went back to research, blocked sources, the audit mode, tokens per game and in total, decisions that couldn't be applied, and anything that looked wrong with a rule or the gate.
