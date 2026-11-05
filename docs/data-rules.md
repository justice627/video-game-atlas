# Data rules

How a game gets into the atlas, and what a finished entry looks like. These rules come before any data: if a case doesn't fit, change the rules first, then the data.

## The model

| Table | One row per | Holds |
| --- | --- | --- |
| `series` | game series or franchise | id, name, Wikidata ID |
| `games` | game | id, title, series, Wikidata ID, release year |
| `places` | real-world place | id, name, Wikidata or GeoNames ID, coordinates, type, parent place |
| `links` | game × place × time | game, place, role, time, level or landmark name, source, confidence, status, flags, note |

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

## 3. Roles

Each link has exactly one role.

| Role | Use when | Example |
| --- | --- | --- |
| `setting` | The game takes place there as a continuous world | Forza Horizon 5 in Guanajuato |
| `level` | A discrete mission, stage or level is there, among others elsewhere | Hitman 3 in Dubai |
| `arena` | A licensed real venue: stadium, arena, circuit or track. Also multiplayer maps based on a real location | FNB Stadium in 2010 FIFA World Cup South Africa |
| `inspiration` | A fictional place a source says is based on this real place. The fictional name is required | Vice City → Miami |
| `strategy` | A grand-strategy or sandbox map covering a region. One link per game, place = the region | Civilization VI → the world |

**Setting or level?** An open, continuous world is `setting`. Separate missions in separate places are `level`.

**Venues in sports and racing games:**

- Every licensed real venue in the game gets its own `arena` link, at the venue itself (type `landmark`), never at its city.
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
| `undated` | No source gives a time. This includes games set in their own present day with no stated year | None. Flagged `needs-time` for research; kept in the data, off the timeline |

Further rules for time:

- **Different places, different times, separate links.** A frame story only gets links for places the frame depicts.
- **Use the range the source gives.** Don't narrow a sourced range to one year, and don't widen it to an era.
- **Eras come from one shared list.** Each list entry has a name, years and a source (PeriodO where it has the period). Add entries only when a game needs them.
- **Years from a chain of sources.** A year may be worked out from sourced relative statements, within a game or across a series. For example, Hitman (2016) has a prologue "In 1999" and its main story "Twenty years later", Hitman 2 is set "following the events of Hitman", and Hitman 3 during and after Hitman 2. Such links are flagged `derived-time`, and the note spells out the chain with a source for each step. Every interval in the chain must be stated ("twenty years later", "two years after"); in that case the link keeps its source's confidence. If any step only says "following" or "after", without saying how long, the link is `low` and its range allows for the gap.
- **Present day is not a year.** A game set in its own present with no year stated is `undated`, not its release year. Research may find the year later.
- **Display:** links with role `strategy` or time `sandbox` are hidden by default, with a switch to show them. So are `arena` links, the venues of sports and racing games: they're numerous and would crowd out story settings. `undated` links never appear on the timeline. Wide `era` links show as approximate in time, the same way coarse pins are approximate in place.

## 5. Series

A series groups games that share a franchise, so overlapping places can be shown once. Most yearly sports games put the same stadiums in game after game.

- Each game belongs to at most one series. Use the Wikidata "part of the series" (P179) item when there is one.
- Tie-ins and successor brands are their own series. The EA World Cup games are not the FIFA series, and EA Sports FC gets its own series rather than continuing FIFA.
- When one game sits in several series on Wikidata, pick the one people would look for. For example, a World Cup tie-in might belong to EA's FIFA World Cup series rather than the yearly FIFA series. Explain the choice in the game's note.
- The map can collapse a series: one pin per place for the whole series, listing which games use it and under which name. The games stay separate rows in the data; collapsing is only a view.

## 6. Sources and confidence

Every link needs at least one source URL that supports its place, role and time. The link's confidence is that of its best source:

| Confidence | Source |
| --- | --- |
| `high` | The game itself (verified by you), or official material from the developer or publisher |
| `medium` | Wikipedia, or reputable games press |
| `low` | A fan wiki, Wikidata alone, or inference |

Wikidata alone is `low`. It's good for IDs and coordinates, not for claims.

## 7. Workflow

1. **`candidate`:** a game someone or something suggested, for example from Wikidata or a theme idea. Candidates live in `data/candidates.csv`, with Wikidata's claims as unverified leads. Not shown.
2. **`draft`:** researched, every link sourced. AI may draft at this stage. Not shown.
3. **`verified`:** you checked the links against the sources. The only status shown on the map.
4. **`excluded`:** kept for the record, with a reason. Not shown.

A game is done when it has at least one link with a role, a place carrying an ID and coordinates, a time type, a source and a confidence, and you have verified it. A verified link can still carry a flag such as `needs-time`: it is correct, just incomplete.

## Worked examples

All five checked against their Wikipedia articles on 2026-11-04.

**Grand Theft Auto: Vice City.** One link: Miami, `inspiration`, fictional name Vice City, `fixed` 1986, confidence `medium`. Wikipedia: "Set in 1986 within the fictional Vice City (based on Miami)" ([source](https://en.wikipedia.org/wiki/Grand_Theft_Auto:_Vice_City)). Fits cleanly.

**Assassin's Creed II.** Five links: Florence, Venice, Monteriggioni, San Gimignano and Forlì, each `setting`, `fixed` 1476–1499, confidence `medium`. Wikipedia: the story "takes place at the height of the Renaissance in Italy from 1476 to 1499", with the open world "comprising several Italian cities, including Florence, Venice, Monteriggioni, San Gimignano, and Forlì" ([source](https://en.wikipedia.org/wiki/Assassin%27s_Creed_II)). The article gives no year or place for the modern-day frame story, so it gets no link until a source does. v0.1 had this game at a single year, 1476.

**Hitman 3.** Six links, `level`: Dubai, Dartmoor, Berlin, Chongqing, Mendoza and the Carpathian Mountains (`region`, parent Romania). Wikipedia lists exactly these six ([source](https://en.wikipedia.org/wiki/Hitman_3)) but gives no in-game year, so every link is `undated` and flagged `needs-time`. The Andaman Sea location added after launch is fictional and has no stated real counterpart, so it gets no link. v0.1 used an unsourced 2020.

**2010 FIFA World Cup South Africa.** Ten links, `arena`, one per tournament stadium (each a `landmark`), `fixed` 2010, hidden until venues are switched on. Wikipedia: "The game includes all 10 venues used at the 2010 FIFA World Cup" ([source](https://en.wikipedia.org/wiki/2010_FIFA_World_Cup_South_Africa_(video_game))). The article doesn't list the ten stadiums, so each stadium link needs a second source (the tournament's Wikipedia article). The generic and qualifying-region stadiums get no links. v0.1 had this as one pin on the country of Japan.

**Civilization VI.** One link: the world, `strategy`, `sandbox`. Wikipedia says players develop their civilization "between ancient times and the near future" ([source](https://en.wikipedia.org/wiki/Civilization_VI)). That gives the eras but not the years, so the link needs "ancient times" and "near future" entries on the era list. v0.1 used an unsourced 4000 BCE–2100. Because it's `strategy` and `sandbox`, it stays off the map unless you switch those games on.

**What the examples changed:** the present-day rule and the `needs-time` flag (from Hitman 3) and the frame-story rule (from Assassin's Creed II) were added after testing. FIFA showed that one link can need two sources, one for "the game has the venues" and one for which venues those are. All five games are now fully described except three items: the Civilization VI era bounds, the FIFA stadium list and Hitman 3's year.
