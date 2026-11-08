# Plan: a self-running, self-checking research pipeline

Status: approved 2026-11-05 (PR 6). All recommendations in section 7 accepted (D1–D8). Merging approved the plan; implementation starts after that, one PR per phase. The design comes from the task brief; this document records what I found, where I changed or tightened the design and why, and the decisions that are still yours.

## 1. What I checked before planning

| Brief says | Found | Effect on the plan |
| --- | --- | --- |
| Repo is private; you will make it public | Already public (the unauthenticated GitHub API returns it) | Phase 0 is a report only; enforcement (phase 7) can use rulesets |
| `local` is 4 commits ahead of `main` | Already merged as PR #5; `main` and `local` are identical | Phase 1 drops the merge step |
| 568 links: 376 arena, 95 setting, 54 level, 32 inspiration, 11 strategy; 299 draft | Confirmed. Statuses: 269 verified, 299 draft. Of the drafts, 240 are `arena`, 31 `setting`, 26 `inspiration`, 1 `strategy` | Arena drafts sit under the sports freeze (see 4.3) |
| Quotes for 170 links, only in `note` | Confirmed (170 notes contain a quotation) | Migration moves the unambiguous ones |
| `validate()` passes | Passes with 0 errors | Baseline for the schema phase |
| Worked examples in data-rules | Hitman 3 is described there as `undated`, but `links.csv` has it `fixed` 2019–2020, `derived-time`, `verified` | The golden test asserts the current data; phase 1 updates the worked example text (a rules change, flagged in that PR) |

### Phase 0: history scan

- **gitleaks 8.21.2** over all refs (`git log --all`, 33 commits): **no findings.**
- **Manual checks:** author and committer identities are GitHub noreply addresses and `noreply@anthropic.com` only. No other email addresses in any diff except an npm maintainer address inside `package-lock.json` (public package metadata). No home-directory paths, keys, tokens or passwords. Every historical `atlas.xlsx` has creator "video-game-atlas" and last-modified-by "Unknown": no names leak through workbook metadata.
- **Content worth a look, not a scrub:** `docs/feasibility.md` named a private repository; this PR rewords that line.
- **Licensing gap:** the repo is public with no `LICENSE`, so legally nobody may reuse it. Decision D1.

Nothing needs scrubbing from history.

## 2. Where each piece runs

```text
Claude Code scheduled session (daily, fresh)        GitHub Actions                         Netlify
  /research-batch 5                                   ci            every PR and push        PR previews (free)
    researcher subagent -> data/staging/<game>/       data-guard    every PR                 production: code merges,
    verify-sources --fetch --changed                  open-data-pr  on push to data/**       plus build hook Mon/Thu
    fact-checker subagent                             automerge     data/** PRs only
    gate --apply                                      review-issue  queue changes on main
    pipeline commit -> push branch data/<date>-<run>  decisions     pinned-issue edits/comments
                                                      nightly       full validation of main
                                                      weekly        re-fetch every source
                                                      deploy        Mon/Thu build hook, budget-capped
```

Two changes from the brief follow from this split:

- **The pinned issue is refreshed by an Action after a data PR merges,** not by the research run. The research session has no `gh`, and the issue should show what is on `main`, not what an open PR proposes. Items appear on your phone a few minutes after the data PR auto-merges.
- **The research run pushes a branch; an Action opens the PR.** The script in the session does `git push origin data/<date>-<run>`. The `open-data-pr` workflow opens the PR with the summary file the run committed (`review/runs/<date>-<run>.md`) and enables auto-merge. The token stays in GitHub secrets, not in the cloud environment.

## 3. Design changes I recommend (push-back on the brief)

**3.1 A bot token is required, not optional.** Pull requests opened with the default `GITHUB_TOKEN` do not trigger `pull_request` workflows. A data PR opened that way never runs `ci` or `data-guard`, the required checks never report, and auto-merge waits forever. The PR-opening Actions (`open-data-pr`, `decisions`, `weekly`) therefore need a separate token, secret `PIPELINE_TOKEN`. Decision D2 is which kind. Without it, phase 7 logs a `blocker` issue and data PRs wait for a manual merge.

**3.2 The researcher writes to a staging area, not to the tables.** The brief gives the researcher write access to `data/`. A subagent with write access to `links.csv` can edit a `verified` row, and nothing but its prompt stops it. Instead it writes `data/staging/<game-id>/{games,places,links,chronology}.csv` plus `blocked.csv`. `scripts/pipeline.ts merge-staging` merges those into the tables and refuses, with a row-level message, any row that would change a `verified` link (it becomes a `change-to-verified` queue row instead), set a status above `draft`, or touch another game. "Never edit a verified link" becomes a check, not a promise. Parallel researchers also stop colliding in one CSV.

**3.3 Tool restrictions are enforced by the harness, not the prompt.** The researcher's `tools:` list is WebSearch, WebFetch, Read, Glob, Grep, Write, Edit: no Bash, so no git, `gh` or shell. Path scope (`data/staging/`, `docs/research/`) is enforced by a `PreToolUse` hook declared in the agent's frontmatter that exits 2 for any other path. If that frontmatter hook isn't supported by the Claude Code version in the cloud image, the fallback is a project-level `PreToolUse` hook keyed on the staging marker file; phase 5 tests both and reports which one works.

**3.4 Migrated drafts don't flood your queue.** Most drafts have no quote, so they fail gate check 2. Sending every failure to `review/queue.csv` would put roughly 50 items there on day one, trip backpressure at 40, and stop research until you've cleared them, which contradicts "nothing waits on me". So: a gate failure that research can fix (no quote, no `medium` source yet, missing chronology row) sends the game back to the research backlog with the reason in `review/backlog.csv`. Only failures that need judgment go to the queue as `needs-human`: a fact-checker objection, `contested`, `real-world-model`, a quote that no longer matches, or a game that has already been researched twice without passing. The 240 arena drafts stay `draft`, untouched, while the sports freeze holds.

**3.5 More than one quote per source.** The brief has one quote per source (` | `-separated, same order as `sources`). Assassin's Creed II already needs two quotes from one article (time, then places). Rule: a URL may repeat in `sources`, one quote per position. The counts still match and nothing new to parse.

**3.6 A quote proves a sentence exists, not that it supports the claim.** Gate check 2 is mechanical (the quote is in the snapshot). Whether that quote supports place, role and time is the fact-checker's job (check 4), and the fact-checker prompt states it as the first thing to test. Audits measure how well that works.

**3.7 Existing verified links keep no quote.** Backfilling quotes on the 269 verified links is a change to a verified link, so it would mean 269 `change-to-verified` rows. Instead they are grandfathered: the weekly re-fetch checks only links that have a quote, and a missing quote on a link that never had one isn't a change. Decision D5 if you want a slow backfill.

**3.8 What burn-in proves.** The gate prints the one-sided 95% (Clopper–Pearson) upper bound on the error rate. For reference: 0 errors in 60 audits gives 4.9%; 1 in 60 gives 7.7%; 0 in 100 gives 3.0%. So exiting burn-in at "at most 1 error in 60" means "probably under 8% wrong". That's a reasonable bar for a map with an "auto" marker; it's not proof of near-perfection. With the sports freeze, "spread across roles" can't include `arena`; the gate reports the role and domain spread so you can see the gap.

**3.9 Audit rows count toward backpressure.** During burn-in every auto-verified link is an audit row, so research speed equals your review speed until 60 audits are done. That's the point of burn-in (verified throughput can't exceed verification capacity), but it means the first weeks are slow by design. Decision D6.

**3.10 Queue conflicts are resolved by regenerating, not merging.** Research runs and the decisions Action both write `review/queue.csv`, so data PRs will conflict. `queue.csv` is fully derived from the link statuses, the audit log, the backlog and the pending decisions, so `npm run queue:build` can always rebuild it. The `open-data-pr` workflow (in the shared concurrency group) merges `main` into a conflicting `data/*` branch, rebuilds the queue, re-runs the gate in check mode and pushes. A conflict in `links.csv` itself is not auto-resolved: the PR gets a comment and the next run redoes the game.

**3.11 Production deploys only through the scheduled build hook (revised 2026-11-06).** Netlify Free has 300 credits a month as a hard limit: when they run out, every site is paused until the next cycle. A production deploy costs 15 credits; deploy previews cost nothing; traffic costs 20 credits per GB and 2 per 10,000 requests ([Netlify docs](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/)). So `scripts/netlify-ignore.sh` skips every production build that the build hook didn't start, code merges included, and `.github/workflows/deploy.yml` calls the hook on Monday and Thursday. `scripts/deploy-gate.ts` counts this cycle's production deploys through the Netlify API and stops at a cap (default 16, 240 credits, leaving 60 for traffic and margin), skips when production already runs `main`, and opens a `blocker` issue instead of failing. A manual run can force a deploy or override the cap.

**3.12 Token usage is approximate.** The pipeline script can't see Claude's token counters. The `/research-batch` command records the usage the Agent tool reports for each subagent call in `review/runs/<date>-<run>.md`; the main session's own usage isn't visible to it. The pilot report states both and how each was measured.

## 4. Target design, as implemented

The brief's target design stands except where section 3 changes it. These points pin down details it left open.

### 4.1 Statuses and flags

`STATUSES` becomes `draft, auto-verified, needs-human, verified, excluded`. Candidates stay in `candidates.csv` (they have no place or role yet, so they can't be links). `buildAtlas` includes `verified` and `auto-verified`; the JSON gains `auto: true` on auto-verified links. New flags: `contested`, `real-world-model` (both already implied by data-rules; now listed and validated).

### 4.2 Validator rules moved from prose into `validate()`

Arena place is `landmark`; `inferred-time` implies `low`; `derived-time` needs chronology rows reaching the game; `sources` and `quote` counts match; `accessed` is an ISO date and present when `quote` is; `auto-verified` and `verified` need a quote unless grandfathered (a verified link from before the migration date, recorded in `data/grandfathered.csv` so it can't be widened); `needs-human` has a queue row; `excluded` has a reason; an `inspiration` with a `real-world-model` date carries `inferred-time` and `low`; country pins carry a note that nothing smaller was sourced; DLC named in note when the link's source is a DLC page. Each rule gets a unit test with one passing and one failing row.

### 4.3 Sports and venue freeze

`data/freeze.csv` lists frozen roles and series (`arena`; the FIFA, EA Sports FC and World Cup series). The pick step skips them, the gate leaves their drafts alone, and the queue never gets their rows. Lifting the freeze is a one-line PR.

### 4.4 Gate and audits

`scripts/gate.ts --check` (CI: fails if any `auto-verified` link no longer passes) and `--apply` (research runs: moves `draft` links to `auto-verified`, back to the backlog, or to `needs-human`). The audit mode is computed from `docs/review/audit-log.csv` every run, never stored, so it can't drift from the log. Sampling uses a seeded random generator (seed = run id) so a run's sample is reproducible.

### 4.5 Review queue and pinned issue

As in the brief, with these details:

- Ids come from a counter in `review/next-id.txt`, so they are never reused even after resolution.
- The issue body is generated by `scripts/review-issue.ts` from `queue.csv`. Checkbox lines are `- [ ] q42 · <game> · <place>`, so a tick is parsed by id, not by position.
- The `decisions` workflow runs only when all of these hold: the issue number equals the pinned issue's (stored in `review/issue.txt`), the event's `sender.login` (edits) or `comment.user.login` (comments) is `justice627`, and the sender isn't a bot. Anything else exits 0 with no output. Its own body refreshes use `GITHUB_TOKEN`, whose events don't trigger workflows, so there are no loops.
- Ticks are found by diffing `changes.body.from` against the new body. Unticking an applied item does nothing and says so.
- The parser is a small hand-written tokenizer in `scripts/lib/commands.ts` with tests for every command, quoting, multi-line comments, unknown ids, already-decided ids and garbage input.

### 4.6 Source evidence

`scripts/verify-sources.ts` as in the brief. Fetch order: MediaWiki `action=query&prop=extracts&explaintext` (Wikipedia, Fandom wikis that have TextExtracts), then `action=parse` stripped to text, then plain HTML stripped with a small tag stripper (no new dependency). One request per host per 2 seconds; `User-Agent: video-game-atlas-research/1.0 (+https://github.com/justice627/video-game-atlas)`. A 403, 429, login wall or bot challenge is recorded as `blocked-source` with the URL and what to look for, and the run continues. Never retried with another user agent, a proxy or a headless browser.

The fetcher reads its settings per domain from the source bank, `data/sources.csv` (tier, access method, API path, status, rate, licence), added in phase 3 after the source research of 2026-11-05. Evidence records (`data/evidence/<sha256 of url+quote>.json`) keep URL, accessed date, content hash and up to 600 characters of context per quote (decision D7 for non-CC sources). Full pages go to `.cache/sources/` (gitignored).

### 4.7 Chronology and derived years

`data/chronology.csv` as in the brief. The build walks each chain from the nearest dated anchor, adds stated intervals, widens ranges for `after`/`before` without an interval, and writes the result as the link's years with `derived-time`. A chain without an anchor gives no years (Pokémon stays undated with no special case). A cycle or two anchors that disagree is a validation error naming both rows.

## 5. Phases

Each phase is one PR, tests green, branch stacked on the previous one, base named in the description. Branch names: `phase/1-foundation` … `phase/7-enforcement`.

### Phase 1: foundation

- `CLAUDE.md` (purpose, data-rules is the authority, pipeline commands, the four hard rules, links to docs). Under 40 lines.
- `netlify.toml`: fix the stale "exactly 400 games" comment; add `ignore = "bash scripts/netlify-ignore.sh"`.
- `atlas.xlsx` out of git: `.gitignore`, `git rm --cached`, replace the workbook-matches-CSV test with a round-trip test in a temp dir (export, import, compare tables). README updated.
- Golden tests (`tests/golden.test.ts`, fixtures in `tests/golden/`): Vice City, Assassin's Creed II, Hitman 3, 2010 FIFA World Cup, Civilization VI, Pokémon, Hitman chain. Each asserts the exact built links for that game. A rule-change PR template section asks which golden tests moved.
- `docs/credits.md` (section 9).
- `LICENSE` and data licence note, per D1.

### Phase 2: schema and migration

- `tables.ts`: new statuses; `quote`, `accessed` on links; `chronology`, `queue-in`, `freeze`, `grandfathered` tables.
- `dataset.ts`: new validator rules (4.2), chronology resolution (4.7), `auto` in the built JSON.
- `scripts/migrate-2026-11.ts`, run once and committed with its output:
  1. Verified links: unchanged; listed in `grandfathered.csv`.
  2. Quotes in `note`: moved to `quote` only when the note holds exactly one quoted passage per source URL; the rest of the note stays. Ambiguous notes are left alone and listed in the PR.
  3. Chronology prose in notes of `derived-time` links: turned into `chronology.csv` rows where the note names both games and the interval; the rest are listed.
  4. Draft links: stay `draft` and go through the gate in phase 6, not here.
- The migration reconciles counts (links in = links out, by status) and fails if they differ.

### Phase 3: source evidence

`scripts/verify-sources.ts` (`--offline`, `--fetch [--changed]`), `scripts/lib/fetch-source.ts`, `scripts/lib/normalize.ts`, evidence records, `.cache/` gitignored, README attribution note. Tests use recorded fixtures, no network.

### Phase 4: hook and settings

`.claude/settings.json`: `PostToolUse` on `Edit|Write` → `scripts/hooks/check-data.sh`, which exits 0 unless the path matches `data/*.csv` or `data/staging/**`, then runs `validate` and `verify-sources --offline` limited to changed rows and exits 2 with row-level messages. No network. Permissions allowlist for the pipeline's own npm scripts.

### Phase 5: subagents and `/research-batch`

- `.claude/agents/researcher.md`, `.claude/agents/fact-checker.md` (3.2, 3.3; fact-checker read-only: Read, Glob, Grep).
- `.claude/commands/research-batch.md`: the seven steps of the brief, with steps 1, 3, 4 and 7 calling `scripts/pipeline.ts` subcommands (`apply-decisions`, `backpressure`, `pick`, `merge-staging`, `commit`) so selection, merging and committing are deterministic. Discovery reuses `fetch:wikidata` and `sync:wikidata`, plus a Wikidata query for games released in the last 12 months with a narrative location (P840).
- `data/queue-in.csv`, `review/backlog.csv`.

### Phase 6: gate, audits, queue, review issue, UI

`scripts/gate.ts`, `scripts/audit.ts` (mode and bound), `scripts/queue.ts` (`queue:build`, apply decisions, move resolved rows), `scripts/review-issue.ts`, `scripts/lib/commands.ts`, workflows `review-issue.yml` and `decisions.yml`. UI: the auto marker (D3) in popup and list, and a "Show auto-verified" switch in the filter panel, with e2e tests. Then the first gate run over the 59 non-arena drafts, as its own data PR.

### Phase 7: enforcement, CI and schedules

- `ci.yml` (replaces `browser-tests.yml`): validate, `verify-sources --offline`, `gate --check`, unit, e2e. Job named `ci`.
- `data-guard.yml`: job `data-guard` as in the brief.
- `open-data-pr.yml`, `automerge.yml`: auto-merge only when the head branch starts with `data/`, `head.repo.full_name` equals this repo, and the author is `justice627` or the `PIPELINE_TOKEN` identity.
- `nightly.yml`, `weekly-refetch.yml`. (The deploy workflow landed early, 2026-11-06; see 3.11.)
- All writing workflows share `concurrency: { group: repo-writer, cancel-in-progress: false }`.
- Ruleset via `gh api` (from a workflow you trigger once, or a command for you to paste, since this session has no `gh` with admin scope): require PR; required checks `ci`, `data-guard`; block force pushes and deletion; no bypass actors; no required approvals. "Allow auto-merge" in repo settings.
- Labels `rule-question`, `blocker`, `data`, `review-queue`.

### Pilot, then the final PR

Pilot on 5 games, proposed: **Kingdom Come: Deliverance** (clean story game, Wikipedia setting section: Bohemia, 1403), **Max Payne 3** (chain: "nine years after" Max Payne 2, which needs its own anchor), **Pokémon Legends: Arceus** (real-world-model date), a **blocked-source game** picked at run time from candidates whose best lead is on Bulbapedia or IGN, and **Sleeping Dogs** (present-day Hong Kong). The report covers what auto-verified, what queued and why, gate rules that looked wrong, and token use per game and per run. Then `docs/plans/scheduled-run.md` with the standalone prompt and a recommended frequency.

## 6. Risks

| Risk | Mitigation |
| --- | --- |
| The cloud session can't push branches other than its own `claude/*` branch | Tested in the pilot. Fallback: the session pushes its own branch and `open-data-pr` copies it to `data/<date>-<run>` before opening the PR |
| The cloud environment's network policy blocks Wikipedia or Wikidata | Tested in phase 3; a blocked host becomes a `blocker` issue with the host name |
| `PIPELINE_TOKEN` expires | `nightly` checks its expiry via the API and opens a `blocker` issue 14 days before |
| Fact-checker and researcher share blind spots (same model) | Fact-checker gets rows, quotes and rules only; audits measure the residual error |
| Auto-verified errors reach the public map | Auto marker, toggle, audits with automatic tightening, and a wrong audit pulls the link immediately |
| A public commenter tries to drive the decisions Action | Hard-coded issue number and sender check; issue locked to collaborators; no LLM in the parser |
| Excerpts from non-CC sources in a public repo | Context capped (D7), source URL kept, full pages never committed |
| Netlify credit overrun (the site pauses at 300) | No production build without the hook; the deploy gate caps deploys per cycle and skips unchanged `main`; previews are free |

## 7. Decisions that are yours

Each has my recommendation first. Replying "go with the recommendations" settles them all.

| # | Decision | Recommendation | Alternative and its cost |
| --- | --- | --- | --- |
| D1 | Licence for a public repo | Code MIT; data CC BY-SA 4.0, matching the Wikipedia text it quotes | CC BY 4.0 for data: more permissive, but sits awkwardly with CC BY-SA quotes; or no licence: nobody may legally reuse anything |
| D2 | `PIPELINE_TOKEN` | Fine-grained personal access token, this repo only, contents + pull requests + issues read/write, 1-year expiry. PRs show as opened by you, which the automerge rule already allows | GitHub App: no expiry and a separate bot identity, about 20 minutes more setup |
| D3 | Auto marker | Popup line "Auto-verified, not yet checked by hand"; a small "auto" tag in the list; pins unchanged | A dashed pin outline: more visible, but dashed already means "approximate" in the review's design language |
| D4 | "Show auto-verified" default | On | Off: a cleaner map, but auto data is invisible to most visitors and the burn-in signal comes only from you |
| D5 | Quotes on the 269 grandfathered verified links | Leave them; backfill only when you touch a link | Backfill as low-priority `change-to-verified` rows, at most 5 per run, outside the backpressure count |
| D6 | Audit rows and backpressure | Count them | Exclude them: research continues during burn-in, and unaudited auto-verified data piles up faster than you check it |
| D7 | Evidence context for non-CC sources (goal.com, ea.com, press) | 300 characters; 600 for CC-licensed sources | 600 everywhere, as in the brief |
| D8 | Pilot games | The five in section 5 | Name your own; the categories must stay |

## 8. Out of scope

Lifting the sports freeze, the road-trip feature, IGDB playtime, and any change to the map beyond the auto marker and toggle.

## 9. Credits

Parts of the verification design adapt principles from a private engineering-guidance collection: producer and verifier kept independent, with the verifier given evidence rather than the producer's conclusion (fact-checker, 3.6); verified throughput capped by verification capacity (backpressure, 3.9); a skipped check counted as uncertainty, never success (blocked sources stay off the map); keeping a checksum of received source data and reconciling counts before and after a load (evidence records, the migration's count check); regression scenarios with deterministic graders (golden tests). The ideas are restated in my own words; no files are copied. Phase 1 adds the same acknowledgement to `docs/credits.md`, without naming the author or the repository.

## 10. Throughput (decided 2026-11-05)

The binding constraint is review time, by design (backpressure at 40 open items); fetch limits, CI, Netlify and the candidate pool are not.

- **Burn-in:** 5 games a day, one run. Every auto-verified link is an audit item, so more games only trip backpressure sooner.
- **After burn-in:** 10 a day, as two runs of 5. Scale by runs, not batch size: smaller contexts, a failed run loses 5 games, and each data PR stays skimmable.
- **Ceiling:** about 20 a day (four runs), only if the pilot shows under about 0.5 `needs-human` items per game, plan usage has room, and audits have reached reduced mode.

`docs/plans/scheduled-run.md` will set the frequency from the pilot's measured numbers.

## 11. Deploy budget (decided 2026-11-06)

Every push to `main` before this change was a production deploy: about 12 to 13 since Netlify was connected on 2026-11-04, so roughly 180 to 195 of this cycle's 300 credits are spent. From now on:

- **Normal cycle:** cap 16 production deploys (240 credits), leaving 60 for traffic and margin. Two scheduled slots a week use about 9; the rest is room for a manual deploy after an urgent code fix.
- **This cycle (burn-in):** the cap counts the deploys already made, so with about 12 used, 4 remain until the cycle resets. In practice that is roughly one deploy a week: a slot only deploys when `main` changed, and data reaches `main` slowly during burn-in.
- **Code merges** no longer deploy on their own. They ship with the next scheduled slot, or by hand from the Deploy workflow when they can't wait.

## 12. Phase 5 notes (2026-11-06)

- **Queue columns:** the brief's columns plus `link` (the link id: game and place alone are ambiguous, e.g. two GoldenEye links share both) and `proposed` (the `field=value` change a `change-to-verified` row would apply on approve).
- **Blocked-source rows:** approve means "I found the quote on the page", reject "it isn't there" (the link goes to `needs-human`), edit sets fields from the note.
- **`/research-batch` is a skill** (`.claude/skills/research-batch/SKILL.md`): Claude Code merged custom commands into skills, and the skill form is the documented one.
- **Fact-check verdicts** are stored per draft link with a hash of the judged fields (`review/factcheck.csv`). Any later change to the link voids its verdict, so the gate (phase 6) only counts a pass for the exact row that was checked.
- **Discovery** adds games published in the last 18 months with a narrative location (Wikidata P840 with coordinates). The full snapshot refresh stays manual and weekly at most.
- The skill calls `npm run gate` and `npm run queue:build`, which arrive in phase 6.

## 13. Phase 6 notes (2026-11-08)

- **Gate outcomes.** Research-fixable failures (no quote, quote not found, best source below medium, low confidence without a dating rule, `derived-time` without a chain) go to `review/backlog.csv`. Judgment failures (a fact-checker objection, `contested`, `real-world-model`, `needs-review`, a chain with an unstated interval, or a game researched twice without passing) go to `needs-human` and the queue. A blocked source or a missing fact-check of the current row leaves the link `draft`.
- **First sweep.** After this phase merges, one `npm run gate -- --apply` over all drafts goes in its own data PR. Dry run on 2026-11-08: of 299 drafts, 240 are frozen venues; of the other 59, 33 go back to research (mostly no quote yet), 25 wait for a fact-check and join the backlog with the reason "needs a fact-check" (not counted as a failed attempt), and 1 (The House of Hikmah, flagged `needs-review`) goes to you.
- **Blocked sources.** Approving a blocked-source item stores your confirmation as evidence; `quote q12 "<text>"` stores the text you found. If the link's quote isn't in that text and the link isn't verified, your text becomes the quote and the link goes back to the gate.
- **The issue.** `.github/workflows/review-issue.yml` creates, pins and locks the issue on the first queue change on `main` (or by hand), and comments once per push that adds items. `.github/workflows/decisions.yml` acts only on that issue (label `review-queue`, marker in the body) and only for `justice627`, writes decisions to `data/decisions` and keeps one PR open for them. Until `PIPELINE_TOKEN` exists (phase 7), that PR's checks won't run and it needs a manual merge.
