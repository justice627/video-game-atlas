import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';
import type { Atlas, Game, Kind, Placement, Span } from '../../src/types.ts';
import { KINDS } from '../../src/types.ts';
import { periodToSpan, type PeriodInput } from './periods.ts';

export const TARGET_GAMES = 400;

/** Wikidata P31 classes whose coordinates are only a rough centroid. */
const COARSE_TYPES = new Set([
  'Q6256', 'Q3624078', 'Q3024240', 'Q5107', 'Q48349', 'Q3336843', 'Q35657', 'Q107390',
  'Q82794', 'Q1620908', 'Q7275', 'Q10864048', 'Q2418896', 'Q855697', 'Q15642541', 'Q1250464',
]);

interface SnapGame {
  qid: string; title: string; year?: number; enwiki?: string;
  places: { qid: string; label: string; lat: number; lon: number; types: string[] }[];
  periods: (PeriodInput & { qid: string })[];
}
interface Snapshot { fetched: string; games: SnapGame[] }
interface PeriodOverride { label: string; from: number | 'release'; to: number | 'release' }
interface Overrides {
  periods: Record<string, PeriodOverride>;
  games: Record<string, { drop?: boolean; spans?: [number, number][]; title?: string }>;
}
interface CuratedPlacement extends Omit<Placement, 'coarse' | 'spans'> { coarse?: boolean; spans?: [number, number][] }
interface CuratedGame {
  id: string; title: string; wiki?: string; year?: number;
  spans: [number, number][]; placements: CuratedPlacement[];
}

const read = (rel: string) => readFileSync(new URL(`../../data/${rel}`, import.meta.url), 'utf8');
const wikiUrl = (title: string) => `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
const toSpans = (xs: [number, number][]): Span[] => xs.map(([from, to]) => ({ from, to }));
const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '');

export interface BuildReport { dropped: { qid: string; title: string; reason: string }[] }

export function buildAtlas(): { atlas: Atlas; report: BuildReport } {
  const snap = JSON.parse(read('wikidata-snapshot.json')) as Snapshot;
  const ov = yaml.load(read('overrides.yaml')) as Overrides;
  const curated = yaml.load(read('curated.yaml')) as CuratedGame[];
  const report: BuildReport = { dropped: [] };

  const fromWikidata: Game[] = [];
  for (const g of snap.games) {
    const patch = ov.games?.[g.qid];
    if (patch?.drop) { report.dropped.push({ qid: g.qid, title: g.title, reason: 'override: drop' }); continue; }
    let spans: Span[] = [];
    if (patch?.spans) spans = toSpans(patch.spans);
    else {
      for (const p of g.periods) {
        const o = ov.periods?.[p.qid];
        if (o) {
          const r = (v: number | 'release') => (v === 'release' ? g.year : v);
          const from = r(o.from), to = r(o.to);
          if (from !== undefined && to !== undefined) spans.push({ from, to, label: o.label });
          continue;
        }
        const s = periodToSpan(p);
        if (s) spans.push(s);
      }
    }
    if (!spans.length) { report.dropped.push({ qid: g.qid, title: g.title, reason: 'no resolvable period' }); continue; }
    fromWikidata.push({
      id: g.qid, qid: g.qid, title: patch?.title ?? g.title, year: g.year, source: 'wikidata',
      wikipedia: g.enwiki, spans,
      placements: g.places.map((p) => ({
        place: p.label, qid: p.qid, lat: p.lat, lon: p.lon, kind: 'setting' as Kind,
        coarse: p.types.some((t) => COARSE_TYPES.has(t)),
      })),
    });
  }

  const fromCurated: Game[] = curated.map((c) => ({
    id: `c-${c.id}`, title: c.title, year: c.year, source: 'curated',
    wikipedia: wikiUrl(c.wiki ?? c.title), spans: toSpans(c.spans),
    placements: c.placements.map(({ spans, coarse, ...p }) => ({
      ...p, coarse: coarse ?? false, ...(spans ? { spans: toSpans(spans) } : {}),
    })),
  }));

  const games = [...fromWikidata, ...fromCurated].sort((a, b) => a.title.localeCompare(b.title));
  return {
    atlas: { built: new Date().toISOString().slice(0, 10), wikidataFetched: snap.fetched, games },
    report,
  };
}

/** Returns a list of problems; empty means valid. */
export function validate(atlas: Atlas): string[] {
  const errs: string[] = [];
  const { games } = atlas;
  if (games.length !== TARGET_GAMES) errs.push(`expected ${TARGET_GAMES} games, got ${games.length}`);
  const ids = new Set<string>();
  const titles = new Map<string, string>();
  const kinds = new Set<Kind>();
  const checkSpan = (where: string, s: Span) => {
    if (!Number.isInteger(s.from) || !Number.isInteger(s.to)) errs.push(`${where}: non-integer span`);
    if (s.from > s.to) errs.push(`${where}: span from > to (${s.from} > ${s.to})`);
  };
  for (const g of games) {
    if (ids.has(g.id)) errs.push(`duplicate id ${g.id}`);
    ids.add(g.id);
    const t = slug(g.title);
    if (titles.has(t)) errs.push(`duplicate title "${g.title}" (${titles.get(t)} and ${g.id})`);
    titles.set(t, g.id);
    if (!g.spans.length) errs.push(`${g.id}: no spans`);
    g.spans.forEach((s) => checkSpan(g.id, s));
    if (!g.placements.length) errs.push(`${g.id}: no placements`);
    for (const p of g.placements) {
      kinds.add(p.kind);
      if (!KINDS.includes(p.kind)) errs.push(`${g.id}/${p.place}: bad kind ${p.kind}`);
      if (!(p.lat >= -90 && p.lat <= 90 && p.lon >= -180 && p.lon <= 180)) errs.push(`${g.id}/${p.place}: bad coords`);
      p.spans?.forEach((s) => checkSpan(`${g.id}/${p.place}`, s));
      if (p.kind === 'inspiration' && !p.fictionalName) errs.push(`${g.id}/${p.place}: inspiration without fictionalName`);
      if (p.bbox && !(p.bbox[0] < p.bbox[2] && p.bbox[1] < p.bbox[3])) errs.push(`${g.id}/${p.place}: bad bbox`);
    }
  }
  for (const k of KINDS) if (!kinds.has(k)) errs.push(`no placement of kind ${k}`);
  return errs;
}
