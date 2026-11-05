# Pokémon mainline games: dating the settings

Research date: 2026-11-05. Scope: the twelve mainline titles listed in the request, one row per version pair.

## Short answer

The mainline Pokémon games cannot be pinned to Gregorian years. No game text, official site, guidebook or developer statement found in this research gives a calendar year for any setting. The in-game dated document that does exist (the Pokémon Mansion diary in Red and Blue) gives only months and days. What does exist is a small set of reliable relative intervals: Gold and Silver are three years after Red and Blue (game text), Black 2 and White 2 are two years after Black and White (official site), and Legends: Z-A is five years after X and Y (games press reporting in-game dialogue). These chains have no absolute starting point, so they cannot produce a `derived-time` year. Game Freak's own producer has said the studio does not apply a timeline rigorously. The honest atlas entry for eleven of the twelve games is `undated` with the `needs-time` flag. Legends: Arceus is the one partial exception: its region is described as Hokkaido during early Japanese colonization, which maps to a known real period (1869 onward), but that is a real-world analogue, not an in-universe date, so it rates low confidence at best.

## Dating table

| Game | Proposed time_type | From–to | Flags | Confidence | Chain or anchor | Sources |
|---|---|---|---|---|---|---|
| Red and Blue | undated | | needs-time | high (that it is undated) | No year anywhere. Mansion diary gives "July 5", "Feb. 6", "Sept. 1" with no year. | [pokered diary text](https://github.com/pret/pokered/blob/master/text/PokemonMansion2F.asm), [Wikipedia](https://en.wikipedia.org/wiki/Pok%C3%A9mon_Red_and_Blue) |
| Gold and Silver | undated | | needs-time | high (interval), none (year) | Red and Blue + 3 years (in-game text). No absolute anchor for Red and Blue, so no year. | [pokecrystal SlowpokeWellB1F](https://github.com/pret/pokecrystal/blob/master/maps/SlowpokeWellB1F.asm), [pokecrystal KurtsHouse](https://github.com/pret/pokecrystal/blob/master/maps/KurtsHouse.asm), [Wikipedia](https://en.wikipedia.org/wiki/Pok%C3%A9mon_Gold_and_Silver) |
| Ruby and Sapphire | undated | | needs-time | low (placement) | Deleted 2014 tweet by Game Freak writer Toshinobu Matsumiya grouped Gen III with Gen I. No interval, no year. | [Pokécharms forum report](https://forums.pokecharms.com/threads/official-pokemon-timeline-confirmed.10106/) |
| Diamond and Pearl | undated | | needs-time | low (placement) | Same deleted tweet grouped Gen IV with Gen II. No interval, no year. | [Pokécharms forum report](https://forums.pokecharms.com/threads/official-pokemon-timeline-confirmed.10106/) |
| Black and White | undated | | needs-time | high (that it is undated) | No year and no stated interval to any earlier game. | [Wikipedia](https://en.wikipedia.org/wiki/Pok%C3%A9mon_Black_and_White) |
| Black 2 and White 2 | undated | | needs-time | high (interval), none (year) | Black and White + 2 years (official site). Black and White has no year, so no year. | [pokemon.com](https://www.pokemon.com/us/pokemon-video-games/pokemon-black-version-2-and-pokemon-white-version-2) |
| X and Y | undated | | needs-time | low (placement) | Deleted tweet grouped X and Y with Black 2 and White 2. No interval, no year. | [Pokécharms forum report](https://forums.pokecharms.com/threads/official-pokemon-timeline-confirmed.10106/), [Wikipedia](https://en.wikipedia.org/wiki/Pok%C3%A9mon_X_and_Y) |
| Sun and Moon | undated | | needs-time | low (placement) | No stated interval to X and Y. Porygon Pokédex: created "roughly 20 years ago", and Porygon already exists in Red and Blue, so Sun and Moon is at most about 20 years after Red and Blue (inference). | [veekun Porygon flavor text](https://veekun.com/dex/pokemon/porygon/flavor), [Wikipedia](https://en.wikipedia.org/wiki/Pok%C3%A9mon_Sun_and_Moon) |
| Sword and Shield | undated | | needs-time | high (that it is undated) | No year and no stated interval. | [Wikipedia](https://en.wikipedia.org/wiki/Pok%C3%A9mon_Sword_and_Shield) |
| Legends: Arceus | era | 1869–1882 | | low | Not an in-universe date. Hisui is "based on the island of Hokkaido during early Japanese colonization" (Wikipedia); Hokkaido was annexed and renamed in 1869; the Development Commission ran 1869 to 1882. Official material says only "an age long ago". Fallback: undated + needs-time. | [Wikipedia PLA](https://en.wikipedia.org/wiki/Pok%C3%A9mon_Legends:_Arceus), [Wikipedia History of Hokkaido](https://en.wikipedia.org/wiki/History_of_Hokkaido), [Wikipedia Development Commission](https://en.wikipedia.org/wiki/Hokkaid%C5%8D_Development_Commission), [pokemon.com](https://www.pokemon.com/us/pokemon-video-games/pokemon-legends-arceus) |
| Scarlet and Violet | undated | | needs-time | high (that it is undated) | No year and no stated interval. Time machine and Paradox Pokémon are in-fiction past and future, not calendar years. | [Wikipedia](https://en.wikipedia.org/wiki/Pok%C3%A9mon_Scarlet_and_Violet) |
| Legends: Z-A | undated | | needs-time | medium (interval), none (year) | X and Y + 5 years (games press citing in-game dialogue). X and Y has no year, so no year. | [Wikipedia](https://en.wikipedia.org/wiki/Pok%C3%A9mon_Legends:_Z-A), [Nintendo Wire](https://nintendowire.com/news/2025/10/14/pokemon-legends-z-as-timeline-placement-has-been-confirmed/), [The Game Haus](https://thegamehaus.com/pokemon-legends-z-a/when-does-pokemon-legends-z-a-take-place/2025/10/16/) |

Note on the Legends: Arceus row: if the atlas only accepts dates for the in-universe setting, use `undated` + `needs-time`. The 1869–1882 range dates the real place and period the region imitates. It is my inference built from a Wikipedia description plus Wikipedia history dates, not a statement by Game Freak.

## Absolute anchors

Finding: none.

- Official sites and Wikipedia articles for all twelve games give the region and its real-world model but no year. Examples: Red and Blue "take place in the region of Kanto, which is based on the real-life Kantō region in Japan" ([Wikipedia](https://en.wikipedia.org/wiki/Pok%C3%A9mon_Red_and_Blue)). Sword and Shield "are set in the Galar Region, inspired by the United Kingdom" ([Wikipedia](https://en.wikipedia.org/wiki/Pok%C3%A9mon_Sword_and_Shield)). X and Y's Kalos "is heavily inspired by Metropolitan France" ([Wikipedia](https://en.wikipedia.org/wiki/Pok%C3%A9mon_X_and_Y)).
- The only in-game dated document found is the Pokémon Mansion diary in Red and Blue. The game text reads "Diary: July 5 / Guyana, / South America", "Diary: July 10 / We christened the / newly discovered / #MON, MEW.", "Diary: Feb. 6 / MEW gave birth." and "Diary; Sept. 1 / MEWTWO is far too / powerful." No year appears. Source: the fan disassembly of the game, which reproduces the cartridge text ([PokemonMansion2F.asm](https://github.com/pret/pokered/blob/master/text/PokemonMansion2F.asm), [PokemonMansion3F.asm](https://github.com/pret/pokered/blob/master/text/PokemonMansion3F.asm), [PokemonMansionB1F.asm](https://github.com/pret/pokered/blob/master/text/PokemonMansionB1F.asm)). Guyana is a real place, but not a datable event.
- Developer statements point away from a fixed chronology. Junichi Masuda, interviewed by Game Informer (2019, as reported by NintendoSoup): "It starts to get a little complicated if you pay too much attention to timelines." and "So we try not to apply it too rigorously." and "Rather than a timeline, it's more of a physical space thing." ([NintendoSoup](https://nintendosoup.com/junichi-masuda-comments-on-the-pokemon-series-complicated-timeline/amp)). The interview date is inferred from the page, not stated on it.
- Not found: any statement by Ohmori or Sugimori, or any official guidebook, that gives a year. A search turned up a claim that a "Pokémon Illustrated Book" implies Red and Green take place in 1995 or 1996, but I could not locate or verify that book or its wording. Treat it as unsourced.

## Relative intervals

### Gold and Silver are three years after Red and Blue
Status: official, from the game itself. High confidence.

- Slowpoke Well grunt: "Yeah, TEAM ROCKET / was broken up / three years ago." ([SlowpokeWellB1F.asm](https://github.com/pret/pokecrystal/blob/master/maps/SlowpokeWellB1F.asm))
- Kurt: "They're supposed / to have disbanded / three years ago." ([KurtsHouse.asm](https://github.com/pret/pokecrystal/blob/master/maps/KurtsHouse.asm))
- Radio Tower grunt: "Three years ago, / TEAM ROCKET was / forced to disband." ([RadioTower2F.asm](https://github.com/pret/pokecrystal/blob/master/maps/RadioTower2F.asm))
- Sabrina: "Three years ago I / had a vision of / your arrival." ([SaffronGym.asm](https://github.com/pret/pokecrystal/blob/master/maps/SaffronGym.asm))
- Wikipedia summarizes: "three years after the conclusion of the previous games" ([Wikipedia](https://en.wikipedia.org/wiki/Pok%C3%A9mon_Gold_and_Silver)).

These lines come from the pret/pokecrystal disassembly (Crystal version), a fan project that reproduces the game's text. The text itself is official; the hosting is not. Team Rocket's disbanding is the end of Red and Blue, so the interval anchors to that game's events.

### Black 2 and White 2 are two years after Black and White
Status: official. High confidence.

- Official site: "Your journey takes place in the Unova region two years after the events of Pokémon Black Version and Pokémon White Version." ([pokemon.com](https://www.pokemon.com/us/pokemon-video-games/pokemon-black-version-2-and-pokemon-white-version-2))
- CoroCoro reveal, via Nintendo World Report: "Two years have passed since the original Black and White" ([Nintendo World Report](https://www.nintendoworldreport.com/news/29799/corocoro-reveals-new-pokemon-black-and-white-2-details))

### Legends: Z-A is five years after X and Y
Status: games press reporting in-game dialogue. Medium confidence. I could not read the dialogue itself, and IGN, the original reporter, was not reachable by my tools.

- Wikipedia: "The game takes place entirely in the Kalos region's Lumiose City, five years after the events of X and Y." Its Setting section cites IGN (Valentine, 14 October 2025). ([Wikipedia](https://en.wikipedia.org/wiki/Pok%C3%A9mon_Legends:_Z-A))
- Nintendo Wire: "According to a preliminary report from IGN, Pokémon Legends: Z-A takes place roughly five years after the events of Pokémon X and Y." ([Nintendo Wire](https://nintendowire.com/news/2025/10/14/pokemon-legends-z-as-timeline-placement-has-been-confirmed/))
- The Game Haus: "We can now confirm that Pokemon Legends Z-A takes place about five years after the events of Pokemon X & Y." and "This comes from an NPC discussing the "mess" with Team Flare." ([The Game Haus](https://thegamehaus.com/pokemon-legends-z-a/when-does-pokemon-legends-z-a-take-place/2025/10/16/))
- Caution: some outlets say "12 years". That is the gap between release dates (2013 to 2025), not the in-game gap ([Game Tyrant](https://gametyrant.com/news/how-much-time-has-passed-between-pokemon-xy-and-pokemon-legends-z-a) says "12 years after the release of Pokémon X and Y" and separately "Five years have passed since the events of Pokémon X and Y.").

### Sun and Moon two years after X and Y?
Status: fan inference. No source found. Reject.

No official or in-game statement gives an interval between X and Y and Sun and Moon. The "about two years" figure appears only in fan forums and listicles. The nearest in-game hint is Porygon's Pokédex text. Sun: "Roughly 20 years ago, it was artificially created, utilizing the latest technology of the time." Ultra Sun: "This Pokémon was created using the cutting-edge science of 20 years ago, so many parts of it have since become obsolete." ([veekun](https://veekun.com/dex/pokemon/porygon/flavor), [PokémonDB](https://pokemondb.net/pokedex/137)). Porygon already exists in Red and Blue, so my inference is that Sun and Moon fall no more than about 20 years after Red and Blue. That is an upper bound, not an interval, and does not touch X and Y.

### Legends: Arceus is "centuries before" Diamond and Pearl
Status: the word "centuries" is Wikipedia's. Official material says only "long ago". Low confidence on any number.

- Wikipedia: "The game is set in the Sinnoh region centuries before the events of Pokémon Diamond and Pearl" (cites the official site and IGN, 26 February 2021) ([Wikipedia](https://en.wikipedia.org/wiki/Pok%C3%A9mon_Legends:_Arceus)).
- Official site: "a land from an age long ago that will one day become known as the Sinnoh region" and "The story unfolds in a long-gone era, before ideas such as being a Pokémon Trainer or having a Pokémon League even existed." ([pokemon.com](https://www.pokemon.com/us/pokemon-video-games/pokemon-legends-arceus))
- Official press text via Gematsu: "Many years ago, the land was called the Hisui region." ([Gematsu](https://gematsu.com/2021/08/pokemon-legends-arceus-discover-the-hisui-region-trailer-details-and-screenshots))

Because the step says only "long ago" or "many years ago", any derived-time result would be low confidence with an unbounded range. Diamond and Pearl has no year anyway.

### Concurrency groupings (the Matsumiya tweet)
Status: a Game Freak employee's statement, but deleted and known only secondhand. Low confidence.

- Pokécharms moderator post, 11 May 2014: scenario writer Toshinobu Matsumiya revealed the order, "The order of the timeline is as follows: Generation I/Generation III -> Generation II/Generation IV", continuing through Black and White, then Black 2, White 2, X and Y together ([Pokécharms](https://forums.pokecharms.com/threads/official-pokemon-timeline-confirmed.10106/)).
- Digital Trends: "In 2014, in a now-deleted tweet, one of Game Freak's head writers laid out the basic timeline of the first six generations of Pokémon games." ([Digital Trends](https://digitaltrends.com/?p=3596947))

The tweet gives order and grouping, not intervals. It predates Sun and Moon and every later game.

## Real-world period for Legends: Arceus

Sourced facts:
- Wikipedia (Legends: Arceus): "which is based on the island of Hokkaido during early Japanese colonization" (lead, no inline citation) ([Wikipedia](https://en.wikipedia.org/wiki/Pok%C3%A9mon_Legends:_Arceus)). The article does not mention Meiji, Ezo or the Ainu.
- Wikipedia (Diamond and Pearl): "Diamond and Pearl are set in the fictional region of Sinnoh, an island based on the Japanese island of Hokkaido." (cites IGN, 22 March 2007) ([Wikipedia](https://en.wikipedia.org/wiki/Pok%C3%A9mon_Diamond_and_Pearl))
- Wikipedia (History of Hokkaido): the Matsumae domain was "granted exclusive trading rights with the Ainu in the Azuchi-Momoyama and Edo periods (1568–1868)"; "In 1869, following the Meiji Restoration, the entire island was annexed, colonized, and renamed Hokkaido by Japan."; "From the 1870s to the 1880s, Japanese leaders placed their efforts on settling Hokkaido" ([Wikipedia](https://en.wikipedia.org/wiki/History_of_Hokkaido)).
- Wikipedia (Hokkaido Development Commission): "it was established in 1869 and disbanded in 1882." ([Wikipedia](https://en.wikipedia.org/wiki/Hokkaid%C5%8D_Development_Commission))
- SUPERJUMP essay (Drawn Stories, 3 September 2022), commentary not official: the game "still seems to draw parallels from" "the Hokkaidō Development Commission (1869 - 1882)" and notes "the Meiji Restoration (which started in 1868)" ([SUPERJUMP](https://superjumpmagazine.com/pokemon-legends-arceus-japanese-influence)).
- A search snippet attributed to Bulbapedia's Hisui article says Hisui "may be based on" Hokkaido "while it was still known as Ezo, before its annexation during the Meiji era". I could not fetch Bulbapedia to confirm the wording ([Bulbapedia](https://bulbapedia.bulbagarden.net/wiki/Hisui_region)).

Two readings, which disagree:
1. Meiji settlement (1869 onward). Fits "early Japanese colonization", the Galaxy Expedition Team as an outside settling body, and Western-style dress noted by SUPERJUMP. Range 1869–1882 using the Development Commission years.
2. Late Ezo, before 1869. Fits the Bulbapedia phrasing as reported in the search snippet.

No developer statement naming Meiji or Ezo was found, in English or in a Japanese-language search. My recommendation: if the atlas uses the analogue at all, use 1869–1882 at low confidence and say in the entry that it is the real-world model, not the in-game date.

## The "set in the release year" convention

- No official source found says any game is set in its release year.
- Wikipedia gives only release years. None of the twelve game articles checked states a setting year or says a game is set in its release year.
- Serebii's "Pokémon Timeline" is a real-world release timeline. Its first entry is "Pokémon Red & Green" dated "February 27th 1996" with "The initial release of Pokémon Red & Green." It is not an in-universe chronology ([Serebii](https://www.serebii.net/pokemon/timeline.shtml)).
- Bulbapedia's "History of the Pokémon world" could not be fetched (Cloudflare challenge). Search summaries attribute to it the statements that the Gold-era gap "has never been explicitly confirmed in any official material" and that Masuda said Game Freak does not apply a timeline rigorously. These are unverified paraphrases.
- Fan timelines that do assign years (for example Red and Blue in 1996, Gold and Silver in 1999, Ruby and Sapphire in 2002) simply copy Japanese release years. This contradicts the game-text interval: 1996 plus three years agrees for Gold and Silver only by coincidence of a three-year release gap, while the Matsumiya grouping puts Ruby and Sapphire (released 2002) alongside Red and Blue (released 1996). The release-year convention therefore breaks against the only official grouping.

Conclusion: the convention is fan practice, not canon, and the atlas rules already reject it.

## Rejected approaches

- **Release year as setting year.** Not valid under atlas rules, and it contradicts the Matsumiya grouping (Gen III released six years after Gen I but grouped with it) and the Z-A interval (five years in-game against twelve years between releases).
- **Anime timeline.** The anime is an adaptation, "each based on a main installment of the Pokémon video game series", and some films are "set in an alternate continuity to the anime" ([Wikipedia](https://en.wikipedia.org/wiki/Pok%C3%A9mon_(TV_series))). Its protagonist is described as "A 10-year-old Pokémon Trainer" across decades of episodes. It gives no usable chronology for the games.
- **In-game clocks.** Gold and Silver use "a real-time internal clock that keeps track of the current time and day of the week" ([Wikipedia](https://en.wikipedia.org/wiki/Pok%C3%A9mon_Gold_and_Silver)). Ruby and Sapphire "keep track of real-life time; this influences events like tides and berry plant growth." ([Wikipedia](https://en.wikipedia.org/wiki/Pok%C3%A9mon_Ruby_and_Sapphire)). Sun and Moon's "clocks are set 12 hours apart from each other" ([Wikipedia](https://en.wikipedia.org/wiki/Pok%C3%A9mon_Sun_and_Moon)). These track the player's own time, not the story's.
- **The Ruby and Sapphire berry bug.** The cartridge's date code counts from the year 2000. The disassembly comment reads "The berry glitch was caused by not adding days for the year 2000." ([pokeruby rtc.c](https://github.com/pret/pokeruby/blob/master/src/rtc.c)). RPGFan (2003): "The bug appears after the games have been running for more than one year and is related to their internal clock." ([RPGFan](https://classic.rpgfan.com/news/2003/2231.html)). This is a hardware clock epoch, not a story year.
- **Technology in the games.** Not tested in depth. Each game mirrors the hardware era of its release (PCs in Red and Blue, the Rotom Phone in Sword and Shield), which would only reproduce the release-year assumption.
- **Character ages.** Emma's age in Z-A against X and Y (reported by Game Tyrant) supports the five-year interval but gives no year. Red's adult appearance in Sun and Moon gives no stated interval.
- **Fan multi-game timelines** (Bulbapedia user pages, forum projects). They stack inferences and release years. Low tier under atlas rules and not used.

## Separating fact from inference

Sourced facts: the three intervals (3, 2 and 5 years), the Matsumiya grouping as reported, the official "long ago" wording for Hisui, the Wikipedia Hokkaido description, the Hokkaido history dates, the Porygon "20 years ago" text, and the absence of any year in official material.

My inferences: that Sun and Moon is at most about 20 years after Red and Blue; that Hisui's analogue is best dated 1869–1882; and that release-year timelines conflict with the Matsumiya grouping.

## Access notes

- Bulbapedia returned 403 to WebFetch and a Cloudflare challenge to the API. Not routed around.
- Fandom wikis and web.archive.org were not attempted, per instructions.
- IGN, the primary reporter for the Z-A interval and the Arceus "centuries" wording, was not reachable by my search tool. Its claims appear here only through Wikipedia and other outlets.
- GamePro.de, PokéCommunity and Anime News Network returned 403.
- Game text quotes come from the pret disassembly projects on GitHub (pokered, pokecrystal, pokeruby). The words are the games' own; the repositories are fan projects.

## Full source list

High tier (game text or official):
- Red and Blue game text via pret/pokered: https://github.com/pret/pokered/blob/master/text/PokemonMansion2F.asm , https://github.com/pret/pokered/blob/master/text/PokemonMansion3F.asm , https://github.com/pret/pokered/blob/master/text/PokemonMansionB1F.asm
- Crystal game text via pret/pokecrystal: https://github.com/pret/pokecrystal/blob/master/maps/SlowpokeWellB1F.asm , https://github.com/pret/pokecrystal/blob/master/maps/KurtsHouse.asm , https://github.com/pret/pokecrystal/blob/master/maps/RadioTower2F.asm , https://github.com/pret/pokecrystal/blob/master/maps/SaffronGym.asm
- Ruby code via pret/pokeruby: https://github.com/pret/pokeruby/blob/master/src/rtc.c
- Sun, Ultra Sun and Ultra Moon Pokédex text (via fan databases): https://veekun.com/dex/pokemon/porygon/flavor , https://pokemondb.net/pokedex/137
- Official Black 2 and White 2 page: https://www.pokemon.com/us/pokemon-video-games/pokemon-black-version-2-and-pokemon-white-version-2
- Official Legends: Arceus page: https://www.pokemon.com/us/pokemon-video-games/pokemon-legends-arceus
- Official press text via Gematsu: https://gematsu.com/2021/08/pokemon-legends-arceus-discover-the-hisui-region-trailer-details-and-screenshots
- Masuda via Game Informer, reported by NintendoSoup: https://nintendosoup.com/junichi-masuda-comments-on-the-pokemon-series-complicated-timeline/amp

Medium tier (Wikipedia, games press):
- https://en.wikipedia.org/wiki/Pok%C3%A9mon_Red_and_Blue
- https://en.wikipedia.org/wiki/Pok%C3%A9mon_Gold_and_Silver
- https://en.wikipedia.org/wiki/Pok%C3%A9mon_Ruby_and_Sapphire
- https://en.wikipedia.org/wiki/Pok%C3%A9mon_Diamond_and_Pearl
- https://en.wikipedia.org/wiki/Pok%C3%A9mon_Black_and_White
- https://en.wikipedia.org/wiki/Pok%C3%A9mon_X_and_Y
- https://en.wikipedia.org/wiki/Pok%C3%A9mon_Sun_and_Moon
- https://en.wikipedia.org/wiki/Pok%C3%A9mon_Sword_and_Shield
- https://en.wikipedia.org/wiki/Pok%C3%A9mon_Legends:_Arceus
- https://en.wikipedia.org/wiki/Pok%C3%A9mon_Scarlet_and_Violet
- https://en.wikipedia.org/wiki/Pok%C3%A9mon_Legends:_Z-A
- https://en.wikipedia.org/wiki/Pok%C3%A9mon_(TV_series)
- https://en.wikipedia.org/wiki/History_of_Hokkaido
- https://en.wikipedia.org/wiki/Hokkaid%C5%8D_Development_Commission
- https://www.nintendoworldreport.com/news/29799/corocoro-reveals-new-pokemon-black-and-white-2-details
- https://nintendowire.com/news/2025/10/14/pokemon-legends-z-as-timeline-placement-has-been-confirmed/
- https://thegamehaus.com/pokemon-legends-z-a/when-does-pokemon-legends-z-a-take-place/2025/10/16/
- https://gametyrant.com/news/how-much-time-has-passed-between-pokemon-xy-and-pokemon-legends-z-a
- https://digitaltrends.com/?p=3596947
- https://classic.rpgfan.com/news/2003/2231.html
- https://superjumpmagazine.com/pokemon-legends-arceus-japanese-influence (essay)

Low tier (fan sites, forums):
- https://forums.pokecharms.com/threads/official-pokemon-timeline-confirmed.10106/
- https://www.serebii.net/pokemon/timeline.shtml
- https://bulbapedia.bulbagarden.net/wiki/Hisui_region (not fetched; search snippet only)
- https://bulbapedia.bulbagarden.net/wiki/History_of_the_Pok%C3%A9mon_world (not fetched; search snippet only)
