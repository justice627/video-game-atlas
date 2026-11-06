# Data rules

How a game gets into the atlas, and what a finished entry looks like. These rules come before any data: if a case doesn't fit, change the rules first, then the data.

## The model

| Table | One row per | Holds |
| --- | --- | --- |
| `series` | game series or franchise | id, name, Wikidata ID |
| `games` | game | id, title, series, Wikidata ID, release year |
| `places` | real-world place | id, name, Wikidata or GeoNames ID, coordinates, type, parent place |
| `links` | game × place × time | id, game, place, role, time, level or landmark name, sources, quotes, accessed date, confidence, status, flags, note |
| `logos` | game or series logo | the game or series, Commons file, licence, author, local image, checksum, accessed date, status |

Almost all the work happens in `links`. Series, games and places are reference data, and a link is a claim: *this game uses this place, in this way, at this time, and here is the source.*

## 1. Which games qualify

A game qualifies when a source says it depicts a real-world place, or a fictional place explicitly based on one.

- It must be a released, standalone game. DLC, expansions, editions, remasters and bundles are not separate games. If DLC adds a location, the link goes on the base game, with the DLC named in the note.
- A remake counts as a separate game only if its setting differs from the original.
- Wholly fictional worlds with no stated real counterpart are out of scope.

## 2. Places

- **Use the most specific place the source supports:** a landmark over a city, a city over a region, a region over a country.
- **Take coordinates from the place's Wikidata or GeoNames record, never from memory.** Store that ID on the place.
- **Use one row per place.** Paris exists once; every game that uses Paris links to that row.
- **Use one of four types:** `landmark`, `city`, `region` or `country`. Set the parent for zooming (Eiffel Tower → Paris → France).
- **No coordinates on the record?** Leave lat/lon empty. The place is drawn at its parent's location and marked approximate (Romanian Carpathians → Romania). Areas such as "the world" get a bounding box instead of a point.
- **Country pins are a last resort.** Use one only when the source names nothing smaller. They show as approximate pins.
- **For historical settings, never pin a modern state.** Ancient China is not the People's Republic of China. Use the specific city, or a historical region item that has coordinates. If the place's name has changed, put the place under its modern identity and the name the game uses in the link (Istanbul, shown as "Constantinople").

## 3. Roles and depiction

Each link has exactly one role, for how the game uses the place, and one depiction, for how faithfully it shows it.

| Role | Use when | Place type | Example |
| --- | --- | --- | --- |
| `world` | A continuous, explorable world: an open world, or the one place the whole game happens in | any | Forza Horizon 5 in Guanajuato; What Remains of Edith Finch on Orcas Island |
| `level` | A discrete story mission, chapter or stage among others, linear or not | any | Hitman 3 in Dubai; Uncharted 3's Cartagena prologue |
| `map` | A multiplayer or competitive map with no story: shooters, battle royales | any | Gallipoli's battlefields |
| `venue` | A licensed real venue in a sports or racing game: stadium, arena, circuit, track, pitch | `landmark` | FNB Stadium in 2010 FIFA World Cup South Africa |
| `stage` | A backdrop the player fights or plays in front of, not through, in games built around such backdrops | any | A fighting game's stages |
| `strategy` | A grand-strategy or sandbox map covering a region. One link per game, place = the region | `region` | Civilization VI → the world |

| Depiction | Use when | Example |
| --- | --- | --- |
| `real` | The game shows the place under its real name | Florence in Assassin's Creed II |
| `fictionalized` | A fictional place that a source says is based on this real place. `fictional_name` is required | Vice City → Miami (`world`); The Sceptre → Burj Khalifa (`level`) |

**World or level?** An open, continuous world, or a single continuous place, is `world`. Separate missions or chapters in separate places are `level`, even when they're all in one city.

**Edge cases.** Open-world racing on public roads (Forza Horizon) is `world`. A licensed street circuit (Monaco) is a `venue` at the circuit. Point-to-point rally stages on real roads are `venue` when licensed and named, otherwise left out like other generic venues. A distant prologue in an open-world game (GTA V's North Yankton) is `level`. A boss arena in a story game is `level`; `stage` is only for games built around backdrops.

**Venues in sports and racing games:**

- Every licensed real venue in the game gets its own `venue` link, at the venue itself (type `landmark`), never at its city.
- **Only licensed venues are included.** A licensed venue is a real stadium, arena, circuit or track that the game shows under its real name, under licence. Generic venues are left out entirely, with no link of any kind. That covers fictional stadiums, and real ones shown under a made-up name because the game lacks the licence. When a source doesn't make clear whether a venue is licensed, it stays out until one does.
- The venue list needs a source: the game's own list (Wikipedia, official site, or a fan wiki at `low`), or a source for "the game has the tournament's venues" plus one for which venues those were.
- Venues change names. The place row uses the venue's current name; the link's `name_in_game` holds the name the game uses (place Johan Cruijff ArenA, shown in an older game as "Amsterdam ArenA").
- Time is the season or tournament the game depicts (2010 for the 2010 World Cup game).
- **Season rule for yearly sports games:** unless a source says otherwise, a yearly game depicts the season that starts in its release year (FIFA 19, released 2018, depicts 2018–19). Links dated this way are `fixed`, flagged `inferred-time`, at `low` confidence until a source states the season directly. Games that aren't yearly and name no season are `undated` and flagged `needs-time`.

## 4. Time

Time lives on the link, never on the place: Florence has no era, Assassin's Creed II in Florence does. Each link has a time type and years. Negative years are BCE.

| Type | Use when | Years |
| --- | --- | --- |
| `fixed` | A source gives a year or a short dated range | The years stated: 1986, or 1476–1499 |
| `era` | Set in a named period without a year (Edo period, ancient Greece) | The era's bounds, from the era list |
| `sandbox` | The player moves through time (Civilization, Europa Universalis) | The start and end of playable time, from the era list or the game's own dates |
| `undated` | No source gives a time, and neither the present-day rule nor a chain applies | None. Flagged `needs-time` for research; shown only under "All time" or with the undated switch |

Further rules for time:

- **Different places, different times, separate links.** A frame story only gets links for places the frame depicts.
- **Use the range the source gives.** Don't narrow a sourced range to one year, and don't widen it to an era.
- **Eras come from one shared list.** Each list entry has a name, years and a source (PeriodO where it has the period). Add entries only when a game needs them.
- **Years from a chain of sources.** A year may be worked out from sourced relative statements, within a game or across a series. For example, Hitman (2016) has a prologue "In 1999" and its main story "Twenty years later", Hitman 2 is set "following the events of Hitman", and Hitman 3 during and after Hitman 2. Such links are flagged `derived-time`, and the note spells out the chain with a source for each step. Every interval in the chain must be stated ("twenty years later", "two years after"); in that case the link keeps its source's confidence. If any step only says "following" or "after", without saying how long, the link is `low` and its range allows for the gap.
- **Present-day rule.** A game set in its own present with no year stated is dated to its release year, `fixed`, flagged `inferred-time`, at `low` confidence, the same way as the season rule. It applies only when the game shows a contemporary world: a source calls it modern-day, present-day or contemporary, or the game shows no other period. A sourced year always replaces it. Within a series, anchor the earliest such game and chain the rest by their stated intervals (flag `inferred-time derived-time`); a stated interval overrides a later game's release year. **Exception:** when a research report in `docs/research/` finds that the series' own sources reject release-year dating, the rule does not apply and the series stays `undated` unless the report supports a dating (Pokémon: only Legends: Arceus, through its real-world model).
- **Chains live in `data/chronology.csv`.** Each row says one thing is `after`, `before` or `during` another, with `interval_years` only when the source states it, plus a source and quote. Either end can be a single link (`uncharted-3/cartagena`, for a flashback), a game (its main story), or, as the start, an anchor: `year:1999` (the quote must contain the year) or `era:<id>`. A dated link that no row targets also serves as an anchor. A `derived-time` link needs a row for itself or its game; its years must fall inside what the chain allows, and when every step states its interval the build can fill them in. Links verified before 2026-11 (`data/grandfathered.csv`) may still have their chain only in the note.
- **A chain needs a start.** Sourced intervals between games (Gold and Silver are "three years after" Red and Blue) give no year until one game in the chain has a year, sourced or from the present-day rule. The note always records the interval.
- **A real-world model is a weak date.** When a fictional place is modelled on a real place *at a certain time* (Hisui is Hokkaido "during early Japanese colonization"), that period dates the inspiration, not the game. Use it only when nothing better exists: `era` (or `fixed` with the period's years), flagged `inferred-time`, at `low`, with the note saying it dates the model.
- **What stays undated.** Games with no contemporary world and no period at all (Super Mario Odyssey's kingdoms), and prequels or sequels whose only link to a dated game is an unbounded "before" or "after" with nothing to close the range.
- **Display:** links with role `strategy` or time `sandbox` are hidden by default, with a switch to show them. So are `venue`, `map` and `stage` links (sports and racing venues, multiplayer maps and fighting-game backdrops), each behind its own chip: they're numerous or not story places, and would crowd out the worlds and levels. `undated` links have no time to match, so they appear only when the range is "All time" (the default) or the "Show undated games" switch is on; the list then marks them "Undated" and draws their pins as approximate. In any narrower window without the switch, the panel names them in a note instead. Wide `era` links show as approximate in time, the same way coarse pins are approximate in place.

## 5. Series

A series groups games that share a franchise, so overlapping places can be shown once. Most yearly sports games put the same stadiums in game after game.

- Each game belongs to at most one series. Use the Wikidata "part of the series" (P179) item when there is one.
- Tie-ins and successor brands are their own series. The EA World Cup games are not the FIFA series, and EA Sports FC gets its own series rather than continuing FIFA.
- When one game sits in several series on Wikidata, pick the one people would look for. For example, a World Cup tie-in might belong to EA's FIFA World Cup series rather than the yearly FIFA series. Explain the choice in the game's note.
- The map can collapse a series: one pin per place for the whole series, listing which games use it and under which name. The games stay separate rows in the data; collapsing is only a view.

## 6. Sources and confidence

Every link needs at least one source URL that supports its place, role and time, and a quote from each source (section 7). The link's confidence is that of its best source:

| Confidence | Source |
| --- | --- |
| `high` | The game itself (verified by you), or official material from the developer or publisher |
| `medium` | Wikipedia, or reputable games press |
| `low` | A fan wiki, Wikidata alone, or inference |

Wikidata alone is `low`. It's good for IDs and coordinates, not for claims.

**The source bank** (`data/sources.csv`) records each domain's tier from this table, how its text is read, and whether it can be fetched at all. Every source URL's domain must be in the bank, and a link's confidence can't be higher than the best tier among its sources. Add a domain to the bank, with its tier, before using it. A domain marked `blocked` refuses automated fetching: its quotes come from you through the review queue, never from a workaround.

## 7. Workflow

1. **`candidate`:** a game someone or something suggested, for example from Wikidata or a theme idea. Candidates live in `data/candidates.csv`, with Wikidata's claims as unverified leads. Not shown.
2. **`draft`:** researched, every link sourced, with a quote per source. AI may draft at this stage. Not shown.
3. **`auto-verified`:** passed every check of the automatic gate (`docs/plans/pipeline.md`, section 4.4): valid, every quote found in a snapshot of its source, a `medium` or better source (or a deterministic `inferred-time` rule with quoted inputs), no fact-checker objection, and no flag that needs judgment (`contested`, `real-world-model`, `needs-review`). Shown on the map, marked "auto". A sample is audited by hand.
4. **`needs-human`:** failed or skipped a gate check that research can't fix. Not shown; waits in the review queue with the reason.
5. **`verified`:** you checked the links against the sources. Shown. Never changed automatically: a proposed change goes to the review queue, and the link keeps its values until you approve.
6. **`excluded`:** kept for the record, with a reason. Not shown.

**Quotes.** Each source on a link has a quote: the sentence or sentences that support the claim, in `quote`, separated by ` | ` in the same order as `sources`. A source that supports two claims with separate sentences is listed twice. ` … ` marks an elision inside one quote. `accessed` is the date the quotes were checked. Links verified before 2026-11 may lack quotes; they're listed in `data/grandfathered.csv`, and that list never grows.

**Ids.** Every link has a stable `id`, `game_id/place_id`, with `/2`, `/3` for a second or third link to the same place. Ids are never reused or changed.

**Research reports.** When a question needs more than a game's own article (dating a whole series, settling conflicting sources), write it up as a report in `docs/research/`, named after the topic. The report gives one proposed row per game in the rules' terms (time type, years, flags, confidence) with a source and quote for each claim, and lists what was rejected and why. Links that rely on a report name it in their note. A report proposes; the links still go through `draft` and `verified` as usual.

A game is done when it has at least one link with a role, a place carrying an ID and coordinates, a time type, a source with its quote and a confidence, and it is verified or auto-verified. A verified link can still carry a flag such as `needs-time`: it is correct, just incomplete.

## 8. Logos

A logo lets you recognize a game at a glance. Logos are shown in popups and the list, not on the map (decided 2026-11-06; the map may follow later as its own change).

- **One source: Wikimedia Commons, through Wikidata.** A game's or series' logo is the Commons file named by the "logo image" (P154) statement on its Wikidata item. No other source: no cover art, store images, IGDB or SteamGridDB, and no lookalikes drawn by hand.
- **Only free files.** A logo is used only if its Commons licence is public domain (including "too simple to be copyrighted"), CC0, CC BY or CC BY-SA, and the file page carries no deletion or missing-permission notice. Anything else stays out. A file whose origin looks doubtful (for example, a name pointing to a fan site) may be excluded by hand, with the reason in the note.
- **Trademarks stay trademarks.** A free licence covers copyright only. Logos identify the game they name and nothing else, and the page says the atlas is not affiliated with or endorsed by any publisher.
- **Stored, not hotlinked.** The fetch script (`npm run fetch:logos`) records each file in `data/logos.csv` with its licence, author, checksum and the date it was checked, and saves a rendering about 330 px wide (Commons' nearest standard size; smaller originals as they are) in `data/logos/`. The build copies those files to the site; visitors never call Wikimedia. The images keep their own licences: `data/logos/` is not covered by the CC BY-SA licence of the tables (`data/LICENSE.md`).
- **Attribution.** A logo in a popup links to its Commons file page, which names the author and licence; every logo's tooltip gives the licence and author, and the panel says where logos come from. List rows are buttons, so their logos carry the tooltip but no link.
- **Status.** `ok` rows passed the licence check and are shown; `excluded` rows are kept, with the reason in the note, so the file isn't fetched again. A popup shows the game's logo, else its series' logo. A game with neither shows no logo.
- **Blocked fetches.** When Commons refuses or rate-limits the script, it stops, says so, and writes nothing for the files it couldn't check (hard rule 1).

## Worked examples

All five checked against their Wikipedia articles on 2026-11-04. Each is a golden test (`tests/golden.test.ts`) that asserts its exact built output, together with the Pokémon chain (no anchor, stays undated).

**Grand Theft Auto: Vice City.** One link: Miami, `world`, `fictionalized` as Vice City, `fixed` 1986, confidence `medium`. Wikipedia: "Set in 1986 within the fictional Vice City (based on Miami)" ([source](https://en.wikipedia.org/wiki/Grand_Theft_Auto:_Vice_City)). Fits cleanly.

**Assassin's Creed II.** Five links: Florence, Venice, Monteriggioni, San Gimignano and Forlì, each `world`, `fixed` 1476–1499, confidence `medium`. Wikipedia: the story "takes place at the height of the Renaissance in Italy from 1476 to 1499", with the open world "comprising several Italian cities, including Florence, Venice, Monteriggioni, San Gimignano, and Forlì" ([source](https://en.wikipedia.org/wiki/Assassin%27s_Creed_II)). The article gives no year or place for the modern-day frame story, so it gets no link until a source does. v0.1 had this game at a single year, 1476.

**Hitman 3.** Six links, `level`: Dubai, Dartmoor, Berlin, Chongqing, Mendoza and the Carpathian Mountains (`region`, parent Romania), plus one fictionalized `level`: the Burj Khalifa, as the Dubai level's Sceptre. Wikipedia lists exactly these six locations ([source](https://en.wikipedia.org/wiki/Hitman_3)) but gives no in-game year. The year comes from a chain: Hitman (2016) has a prologue "In 1999" and its main story "Twenty years later" (2019), Hitman 2 is set "Following the events of Hitman", and Hitman 3 "during the events of Hitman 2". Two steps give no interval, so every link is `fixed` 2019–2020, flagged `derived-time`, at `low`. The Andaman Sea location added after launch is fictional and has no stated real counterpart, so it gets no link. v0.1 used an unsourced 2020; the first version of this example had the links `undated`.

**2010 FIFA World Cup South Africa.** Ten links, `venue`, one per tournament stadium (each a `landmark`), `fixed` 2010, hidden until venues are switched on. Wikipedia: "The game includes all 10 venues used at the 2010 FIFA World Cup" ([source](https://en.wikipedia.org/wiki/2010_FIFA_World_Cup_South_Africa_(video_game))). The article doesn't list the ten stadiums, so each stadium link needs a second source (the tournament's Wikipedia article). The generic and qualifying-region stadiums get no links. v0.1 had this as one pin on the country of Japan.

**Civilization VI.** One link: the world, `strategy`, `sandbox`. Wikipedia says players develop their civilization "between ancient times and the near future" ([source](https://en.wikipedia.org/wiki/Civilization_VI)). That gives the eras but not the years, so the link needs "ancient times" and "near future" entries on the era list. v0.1 used an unsourced 4000 BCE–2100. Because it's `strategy` and `sandbox`, it stays off the map unless you switch those games on.

**What the examples changed:** the `needs-time` flag (from Hitman 3) and the frame-story rule (from Assassin's Creed II) were added after testing. FIFA showed that one link can need two sources, one for "the game has the venues" and one for which venues those are. Hitman 3's year later came from the chain above. The Civilization VI era bounds and the FIFA stadium list are still open.
