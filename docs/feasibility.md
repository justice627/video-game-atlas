# Video Game Atlas: feasibility

Probed on 2026-11-04. Method follows ai-hub's `technical-exploration` (smallest informative experiment first) and `compare-and-decide` skills.

## Verdict

Feasible as a personal project. Every UI feature is standard web work. The real cost is the data: no public source records *where and when* games are set at the precision this idea needs. Wikidata gives a usable seed of about 4,000 mappable games, but levels, arenas, landmarks, fictional analogs and time periods mostly have to be curated. Treat this as a curated dataset with a map on top, not a map that pulls data from an API.

## Evidence (Wikidata, live SPARQL)

Reproduce with `scripts/probe/wikidata_coverage.sh`.

| Measure | Count |
| --- | --- |
| Video games in Wikidata | 178,631 |
| Games with a narrative location (P840) | 4,674 |
| ...where that location has coordinates | 4,029 |
| Games with a "set in period" (P2408) | 733 |
| Games with both coordinates and period | 359 |
| Location links that are countries / cities / other / buildings | 2,232 / 1,159 / 1,622 / 21 |
| Fictional locations used by games | 692 |
| ...linked to a real-world analog (P1074) | 11 |

What the numbers mean in practice:

- **Quality is high where it exists.** Kingdom Come: Deliverance lists 14 real Bohemian villages and castles plus 1403. Assassin's Creed II lists Florence, Venice, Monteriggioni, San Gimignano, Forlì and 1476. The Division points at the James Farley Post Office.
- **Most links are coarse.** Half point at a whole country (Red Dead Redemption 2 = "United States"; Shenmue = "Japan"). A pin in the middle of a country is close to useless on a map.
- **Landmarks are nearly absent.** 21 games link to a building. Eiffel Tower and Duomo links must be hand-made.
- **"Setting" is overloaded.** Washington D.C. has 239 games, largely Madden and NHL titles tagged because of team rosters. Sports venues and story settings are mixed in one property, so the type filter cannot come from Wikidata.
- **The fictional-analog model works but is empty.** Vice City → Miami, Saint Denis → New Orleans, Kamurochō → Kabukichō, Sōtenbori → Dōtonbori all resolve to coordinates. Only 11 of 692 fictional places have this link.
- **Time is the thinnest field.** 733 games have a period. Values mix years (1476), centuries, and named eras ("Kamakura period", "early modern period") that need mapping to year ranges.

Playtime: IGDB exposes a `game_time_to_beats` endpoint ([go-igdb](https://git.nite07.com/nite/go-igdb/src/branch/main/endpoint/game_time_to_beats.go), [GameVault docs](https://gamevau.lt/docs/server-docs/metadata-enrichment/provider-igdb/)), free for non-commercial use with attribution at 4 requests/second ([omnigame/igdb](https://packagist.org/packages/omnigame/igdb), [Twitch dev forum](https://discuss.dev.twitch.com/t/commercial-use-of-igdb-api/23567)). The official docs were not verified here. HowLongToBeat has no official API; avoid scraping it.

## Feature by feature

| Feature | Difficulty | Notes |
| --- | --- | --- |
| Interactive world map | Low | MapLibre GL JS with free vector tiles. Clustering is built in. |
| Dual-knob timeline, deep past to future | Medium | Store integer years (negative = BCE). A linear scale fails: 13.8 billion years squashes 2026 into a pixel. Use a piecewise or log-like scale, with presets ("Antiquity", "1980s", "Future"). |
| Map reacts to timeline | Low | Client-side filter on a few thousand records is instant. |
| Multiple coordinates per game | Low | A `placements` table, not a column on `games`. |
| Landmark links | Medium (data) | Model is trivial; filling it is manual. Use Wikidata IDs for landmarks so names, photos and coordinates come free. |
| Setting-type filters | Medium (data) | Needs a `kind` on each placement. Must be curated. |
| Grand strategy treatment | Low | Mark as `kind = region` with a GeoJSON polygon or bounding box instead of a pin. Otherwise Europa Universalis covers the whole planet and pollutes every view. |
| Road trip by playtime | Medium | Filter, then pick games under a time budget (knapsack-style greedy is fine), then order by geography or chronology. |
| Road trip by free-text theme | Medium | An LLM turns "open-world games set in 1980s Europe" into a structured filter. The database does the selection. Do not let the model invent games. |
| Game-to-game links | Low | Series and shared-setting edges. Wikidata has series (P179). |
| Links to world history | Medium | Link periods and events to Wikidata items. Displaying them is easy; choosing them is curation. |

## Data model sketch

```text
game        (id, title, wikidata_qid, igdb_id, release_year, hours_main, genres[], open_world)
place       (id, name, wikidata_qid, lat, lon, geometry?, kind: city|landmark|region|venue|fictional)
placement   (game_id, place_id, kind: setting|level|arena|circuit|inspiration|strategy_map,
             year_from, year_to, level_name?, source, confidence)
place_link  (fictional_place_id, real_place_id)   -- Vice City -> Miami
```

Put time on `placement`, not `game`. Assassin's Creed II's Florence is 1476; its modern frame story is 2012. Keep `source` and `confidence` on every row so curated, imported and AI-suggested data stay distinguishable.

## Recommended approach

Build a static site: a build script pulls Wikidata, merges a hand-curated YAML/JSON file in the repo, and emits one JSON file the browser filters. No backend, no database server, free hosting on GitHub Pages. This stays reversible; add a backend only if the dataset outgrows the browser (tens of thousands of placements) or you want accounts.

For curation, use AI as a drafter: given a game, propose placements with sources (wiki pages, location guides), and you approve each one. This is where most of the effort goes, and it is the part worth automating carefully.

## Risks

- **Curation effort is open-ended.** Cap it: start with games you know and want to play.
- **Licensing.** Wikidata is CC0. IGDB is free non-commercial with attribution. Fine for a personal tool; check terms before going public or commercial.
- **Coarse pins mislead.** Hide or de-emphasize country-level placements by default.

## First experiment (smallest useful version)

One page: map plus timeline slider, loaded from the 359 Wikidata games that have both coordinates and a period, plus about 20 hand-curated games including at least one level-based game, one racing game with circuits, one fictional-analog city and one grand strategy title. That answers the open question cheaply: does browsing games by place and time feel worth using? Road trips and AI queries come after that answer is yes.
