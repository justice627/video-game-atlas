// Shapes of public/atlas.json. Field meanings follow docs/data-rules.md.
export type Role = 'setting' | 'level' | 'arena' | 'inspiration' | 'strategy';
export const ROLES: Role[] = ['setting', 'level', 'arena', 'inspiration', 'strategy'];
export const ROLE_LABEL: Record<Role, string> = {
  setting: 'Setting',
  level: 'Level',
  arena: 'Venues (sports, racing)',
  inspiration: 'Fictional inspiration',
  strategy: 'Strategy map',
};
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
  fictionalName?: string;
  nameInGame?: string;
  timeType: TimeType;
  /** Absent for undated links and for sandbox links without known years. */
  span?: Span;
  sources: string[];
  confidence: Confidence;
  flags: string[];
  note?: string;
}

export interface Series { id: string; name: string; wikidata?: string }
export interface Game { id: string; title: string; series?: string; wikidata?: string; year?: number; wikipedia?: string; links: Link[] }

export interface Atlas { built: string; series: Series[]; games: Game[] }
