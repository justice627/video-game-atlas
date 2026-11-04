export type Kind = 'setting' | 'level' | 'arena' | 'inspiration' | 'strategy_map';
export const KINDS: Kind[] = ['setting', 'level', 'arena', 'inspiration', 'strategy_map'];
export const KIND_LABEL: Record<Kind, string> = {
  setting: 'Game setting',
  level: 'Level',
  arena: 'Arena / circuit / map',
  inspiration: 'Fictional inspiration',
  strategy_map: 'Strategy map',
};

/** Integer years. Negative = BCE (historical numbering, no year 0: -49 is 49 BCE). */
export interface Span { from: number; to: number; label?: string }

export interface Placement {
  place: string;
  qid?: string;
  lat: number;
  lon: number;
  kind: Kind;
  /** Country, continent, empire or similar: the pin is only a rough centroid. */
  coarse: boolean;
  /** [west, south, east, north] for strategy maps. */
  bbox?: [number, number, number, number];
  /** Name of the fictional place this real location inspired, e.g. "Vice City". */
  fictionalName?: string;
  levelName?: string;
  /** Overrides the game's spans for this placement when present. */
  spans?: Span[];
}

export interface Game {
  id: string;
  title: string;
  qid?: string;
  year?: number;
  spans: Span[];
  placements: Placement[];
  source: 'wikidata' | 'curated';
  wikipedia?: string;
}

export interface Atlas { built: string; wikidataFetched: string; games: Game[] }
