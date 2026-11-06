// Shapes of public/atlas.json. Field meanings follow docs/data-rules.md.
/** How the game uses the place (docs/data-rules.md, section 3). */
export type Role = 'world' | 'level' | 'map' | 'venue' | 'stage' | 'strategy';
export const ROLES: Role[] = ['world', 'level', 'map', 'venue', 'stage', 'strategy'];
export const ROLE_LABEL: Record<Role, string> = {
  world: 'World',
  level: 'Level',
  map: 'Multiplayer maps',
  venue: 'Venues (sports, racing)',
  stage: 'Stage backdrops',
  strategy: 'Strategy map',
};
/** Roles shown by default; the rest are behind their chip or switch. */
export const DEFAULT_ROLES: Role[] = ['world', 'level'];
export type TimeType = 'fixed' | 'era' | 'sandbox' | 'undated';
export type PlaceType = 'landmark' | 'city' | 'region' | 'country';
export type Confidence = 'high' | 'medium' | 'low';

/** Integer years. Negative = BCE. */
export interface Span { from: number; to: number; label?: string }

export interface Link {
  place: string;
  placeType: PlaceType;
  placeWikidata?: string;
  lat: number;
  lon: number;
  /** The pin is only roughly located: a country or region, or a place shown at its parent's position. */
  approxPlace: boolean;
  /** [west, south, east, north] for places drawn as an area. */
  bbox?: [number, number, number, number];
  role: Role;
  /** A fictional place based on this real one; fictionalName holds its name. */
  fictionalized?: boolean;
  fictionalName?: string;
  nameInGame?: string;
  timeType: TimeType;
  /** Absent for undated links and for sandbox links without known years. */
  span?: Span;
  sources: string[];
  confidence: Confidence;
  flags: string[];
  /** Passed the automatic gate but not yet checked by hand. */
  auto?: boolean;
  note?: string;
}

export interface Series { id: string; name: string; wikidata?: string }
export interface Game { id: string; title: string; series?: string; wikidata?: string; year?: number; wikipedia?: string; links: Link[] }

/** A logo from Wikimedia Commons (docs/data-rules.md, section 8). src is relative to the site root. */
export interface Logo {
  src: string; page: string; licence: string; author?: string;
  /** Ink of the image: dark goes on a light plate, light on a dark one, opaque brings its own background. */
  tone?: 'dark' | 'light' | 'opaque';
}

export interface Atlas {
  built: string; series: Series[]; games: Game[];
  /** By game id and by series id. Absent in data built before logos existed. */
  logos?: { games: Record<string, Logo>; series: Record<string, Logo> };
}
