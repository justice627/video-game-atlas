# video-game-atlas

A personal interactive video game atlas on a world map with a dual-knob timeline from ancient history to the future. It maps games, levels, and landmarks to real coordinates, filters by setting type, and generates themed gaming road trips based on topics like an Islamic world tour, eras, regions, or desired playtime.

## v0.1

One page: a world map, a two-knob timeline from the Big Bang to the year 100,000, and a list of the games in view. It started with 400 games: 355 from Wikidata (every game with both a mappable location and a time period) plus 45 hand-curated ones covering levels, circuits, fictional cities and strategy maps. See [docs/feasibility.md](docs/feasibility.md) for why the data looks like this.

```bash
npm install
npm run dev        # builds public/atlas.json, starts Vite
npm test
npm run build      # data + typecheck + production build into dist/
```

## Data

All game data lives in three CSV tables in `data/`, joined on `game_id`. They are the source of truth: readable in git diffs and shaped like database tables, so a later move to SQLite or Postgres is a direct load.

| File | What it is |
| --- | --- |
| `data/games.csv` | One row per game: id, status (`include`, `review`, `exclude`), title, source, Wikidata id, release year, Wikipedia link, audit flags, notes |
| `data/periods.csv` | One row per time span of a game, with label, years and the Wikidata period id |
| `data/placements.csv` | One row per map location: place, coordinates, kind, coarse flag, fictional name, level name, strategy-map box, own years, source |
| `data/atlas.xlsx` | Excel editing view of the three tables, generated from them |
| `data/wikidata-snapshot.json` | Raw Wikidata pull (CC0), kept for provenance and for adding new games |

Editing in Excel:

```bash
npm run data:export   # tables -> data/atlas.xlsx (only needed if the workbook is missing or stale)
# edit data/atlas.xlsx in Excel, save
npm run data:import   # validates, then writes your edits back to the CSV tables
```

The import refuses files with problems and names the sheet and row of each one. A test fails if `atlas.xlsx` and the CSV tables disagree, so an edited workbook cannot be forgotten. `review` games still show on the map; `exclude` keeps the row for the record and leaves it off the map.

New games from Wikidata: `npm run fetch:wikidata` refreshes the snapshot, then `npm run sync:wikidata` adds games that are not in the tables yet with status `review`. Existing rows are never overwritten.

Years are integers; negative means BCE. A game matches the timeline if any of its periods overlaps the selected range. Hollow pins are country-level or region-level locations whose coordinates are only a rough centroid.

Known data problems are listed in [docs/review/2026-11-04-review.md](docs/review/2026-11-04-review.md) and flagged per game in the `flags` column.

The current view is stored in the URL hash, so views can be shared as links.

## Deploy

Hosted on Netlify via `netlify.toml`: pushes to `main` deploy to production, pull requests get deploy previews. The build runs the tests first.
