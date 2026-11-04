# video-game-atlas

A personal interactive video game atlas on a world map with a dual-knob timeline from ancient history to the future. It maps games, levels, and landmarks to real coordinates, filters by setting type, and generates themed gaming road trips based on topics like an Islamic world tour, eras, regions, or desired playtime.

## v0.1

One page: a world map, a two-knob timeline from the Big Bang to the year 100,000, and a list of the games in view. 400 games: 355 from Wikidata (every game with both a mappable location and a time period) plus 45 hand-curated ones covering levels, circuits, fictional cities and strategy maps. See [docs/feasibility.md](docs/feasibility.md) for why the data looks like this.

```bash
npm install
npm run dev        # builds public/atlas.json, starts Vite
npm test
npm run build      # data + typecheck + production build into dist/
```

## Data

| File | What it is |
| --- | --- |
| `data/wikidata-snapshot.json` | Frozen Wikidata pull (CC0). Refresh with `npm run fetch:wikidata`. |
| `data/curated.yaml` | Hand-curated games. Edit freely. |
| `data/overrides.yaml` | Fixes for Wikidata: dates for undated period items, per-game patches. |

`npm run build:data` merges these into `public/atlas.json` and fails if the result is not exactly 400 valid games. After refreshing the snapshot, add or remove curated entries to get back to 400.

Years are integers; negative means BCE. A game matches the timeline if any of its periods overlaps the selected range. Hollow pins are country-level or region-level locations whose coordinates are only a rough centroid.

Known v0.1 limits: Wikidata games all count as "Game setting" (sports games included), and Wikidata does not say which period belongs to which location.

The current view is stored in the URL hash, so views can be shared as links.
