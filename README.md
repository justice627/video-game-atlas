# video-game-atlas

A personal interactive video game atlas on a world map with a dual-knob timeline from ancient history to the future. It maps games, levels, and landmarks to real coordinates, filters by setting type, and generates themed gaming road trips based on topics like a world tour, eras, regions, or desired playtime.

## v0.2

One page: a world map, a two-knob timeline from the Big Bang to the year 100,000, and a list of the games in view. Only verified data appears. What counts as verified, and how every field is meant, is in [docs/data-rules.md](docs/data-rules.md).

v0.1 (400 games straight from Wikidata plus unverified curation) showed the idea works and the data doesn't: see [docs/review/2026-11-04-review.md](docs/review/2026-11-04-review.md). v0.2 starts over from researched entries.

```bash
npm install
npm run dev        # builds public/atlas.json, starts Vite
npm test
npm run build      # data + typecheck + production build into dist/
npm run test:e2e   # browser tests (Playwright) against the production build
```

Browser tests live in `e2e/`. First time on a machine, install the browser with `npx playwright install chromium`. They compute expected results from `public/atlas.json` with the app's own filter code, so verifying more games never breaks them; series grouping is tested against a fixed fixture (`e2e/fixtures/series-atlas.json`). Map tiles are blocked during tests, so they need no network. GitHub Actions runs them on pushes to `main` and `local` and on pull requests (`.github/workflows/browser-tests.yml`); Netlify runs the unit tests on each deploy.

## Data

Plain CSV tables in `data/` are the source of truth, shaped for a later move to a database.

| File | One row per |
| --- | --- |
| `series.csv` | game series or franchise |
| `games.csv` | game, with its series |
| `places.csv` | real-world place, with Wikidata/GeoNames id and coordinates from that record |
| `links.csv` | claim that a game uses a place, in a role, at a time, with sources, confidence and status |
| `eras.csv` | named period with years and a source |
| `candidates.csv` | game not yet researched, with Wikidata's claims as unverified leads |
| `chronology.csv` | sourced relation between two links or games (after, before, during), used to work out `derived-time` years |
| `queue-in.csv` | game you want researched first |
| `freeze.csv` | role or series that research skips (sports and venues, for now) |
| `grandfathered.csv` | links verified before quotes were required; a fixed list |
| `atlas.xlsx` | Excel editing view of all of the above, generated locally by `data:export` and not committed |

Links with status `verified` or `auto-verified` reach the map; auto-verified ones are marked. Venues of sports and racing games, strategy maps and sandbox games are hidden by default and switched on in the panel; "Group games by series" collapses a series into one pin per place. The build checks every rule it can (sources present, inspiration has a fictional name, undated links flagged `needs-time`, and so on) and names the sheet and row of each problem.

```bash
npm run data:export                       # tables -> data/atlas.xlsx
npm run data:import                       # data/atlas.xlsx -> tables, after validation
npm run place:lookup -- "Monteriggioni"   # find a place's Wikidata id
npm run place:lookup -- Q91228            # its coordinates and type, for places.csv
npm run fetch:wikidata && npm run sync:wikidata   # refresh the snapshot, add new candidates
```

The workbook is a local editing view, ignored by git. Export, edit, then run `data:import` to write the edits back to the CSV files, which are what you commit.

The worked examples in the data rules, plus the Pokémon chain, are golden tests: `tests/golden/*.json` holds their exact built output. After a deliberate rule or build change, run `npm run golden:update` and say in the PR which ones moved.

## Deploy

Hosted on Netlify via `netlify.toml`: pull requests get deploy previews, and the build runs the tests first. A merge to `main` deploys to production unless it changes only data, docs or review files (`scripts/netlify-ignore.sh`); those reach production through the scheduled data deploy.

## Licence

Code: MIT ([LICENSE](LICENSE)). Data in `data/`: [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Quotes and evidence excerpts come from the sources named next to them and keep those sources' terms; Wikipedia text is CC BY-SA, and each record keeps its source URL. Wikidata is CC0.
