# video-game-atlas

A personal interactive video game atlas on a world map with a dual-knob timeline from ancient history to the future. It maps games, levels, and landmarks to real coordinates, filters by setting type, and generates themed gaming road trips based on topics like an Islamic world tour, eras, regions, or desired playtime.

## v0.2

One page: a world map, a two-knob timeline from the Big Bang to the year 100,000, and a list of the games in view. Only verified data appears. What counts as verified, and how every field is meant, is in [docs/data-rules.md](docs/data-rules.md).

v0.1 (400 games straight from Wikidata plus unverified curation) showed the idea works and the data doesn't: see [docs/review/2026-11-04-review.md](docs/review/2026-11-04-review.md). v0.2 starts over from researched entries.

```bash
npm install
npm run dev        # builds public/atlas.json, starts Vite
npm test
npm run build      # data + typecheck + production build into dist/
```

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
| `atlas.xlsx` | Excel editing view of all of the above, generated |

Only links with status `verified` reach the map. Venues of sports and racing games, strategy maps and sandbox games are hidden by default and switched on in the panel; "Group games by series" collapses a series into one pin per place. The build checks every rule it can (sources present, inspiration has a fictional name, undated links flagged `needs-time`, and so on) and names the sheet and row of each problem.

```bash
npm run data:export                       # tables -> data/atlas.xlsx
npm run data:import                       # data/atlas.xlsx -> tables, after validation
npm run place:lookup -- "Monteriggioni"   # find a place's Wikidata id
npm run place:lookup -- Q91228            # its coordinates and type, for places.csv
npm run fetch:wikidata && npm run sync:wikidata   # refresh the snapshot, add new candidates
```

A test fails if `atlas.xlsx` and the CSV tables disagree, so run `data:import` after editing the workbook.

## Deploy

Hosted on Netlify via `netlify.toml`: pushes to `main` deploy to production, pull requests get deploy previews. The build runs the tests first.
