// Logos from Wikimedia Commons (docs/data-rules.md, section 8): licence check, file checks, copying
// into the site. The network part lives in scripts/fetch-logos.ts; everything here is testable offline.
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import type { Atlas } from '../../src/types.ts';
import { inkTone } from './png.ts';
import { LOGO_LICENCE, type LogoRow } from './tables.ts';

export const LOGO_DIR = new URL('../../data/logos/', import.meta.url);
export const SITE_LOGO_DIR = new URL('../../public/logos/', import.meta.url);
/** Width of the PNG rendering requested from Commons. Popups show logos at most 180 px wide, so 2x. */
export const LOGO_WIDTH = 320;
/** Templates on a Commons file page that mean it may be deleted or lacks permission. */
export const DELETION_TEMPLATES = [
  'Template:Delete', 'Template:Speedydelete', 'Template:Copyvio',
  'Template:No license since', 'Template:No permission since', 'Template:No source since',
];

export const fileSha256 = (buf: Buffer | Uint8Array) => createHash('sha256').update(buf).digest('hex');

/** The file name in a Wikidata P154 value (a Special:FilePath URL), decoded. */
export function commonsFileName(p154: string): string {
  const m = /Special:FilePath\/(.+)$/.exec(p154);
  return decodeURIComponent((m ? m[1] : p154).replace(/^File:/i, '')).replace(/_/g, ' ');
}

/** Commons imageinfo extmetadata, as the API returns it: each field is { value }. */
export type ExtMetadata = Record<string, { value: string } | undefined>;

/** Commons metadata as plain text: no HTML, no {{lang:…}} wiki templates, no text repeated back to back. */
export function plain(html?: string): string {
  const t = (html ?? '').replace(/<[^>]*>/g, ' ').replace(/\{\{(?:[a-z-]+:)?([^{}|]*)\}\}/gi, '$1')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim();
  return t.replace(/^(.+?)\s*\1$/, '$1');
}

export type LicenceVerdict =
  | { ok: true; licence: string; licenceName: string; author?: string }
  | { ok: false; reason: string; licence?: string; licenceName?: string };

/** Whether a Commons file may be used as a logo, from its metadata and the templates on its page. */
export function checkLicence(meta: ExtMetadata, templates: string[]): LicenceVerdict {
  const licence = meta.License?.value?.trim().toLowerCase();
  const licenceName = plain(meta.LicenseShortName?.value) || undefined;
  const blocking = templates.filter((t) => DELETION_TEMPLATES.includes(t));
  if (blocking.length) return { ok: false, reason: `file page carries ${blocking.map((t) => t.replace('Template:', '')).join(', ')}`, licence, licenceName };
  if (meta.NonFree?.value && meta.NonFree.value !== 'false') return { ok: false, reason: 'Commons marks it non-free', licence, licenceName };
  if (!licence) return { ok: false, reason: 'no machine-readable licence on Commons', licenceName };
  if (!LOGO_LICENCE.test(licence)) return { ok: false, reason: `licence ${licence} is not public domain, CC0, CC BY or CC BY-SA`, licence, licenceName };
  const author = plain(meta.Artist?.value) || undefined;
  return { ok: true, licence, licenceName: licenceName ?? licence, ...(author ? { author } : {}) };
}

/** Local file name for a logo: kind and id, plus the extension of the rendering Commons served. */
export function imageName(kind: string, id: string, url: string): string {
  const ext = /\.(png|jpe?g|gif)$/i.exec(new URL(url).pathname)?.[1].toLowerCase().replace('jpeg', 'jpg') ?? 'png';
  return `${kind}-${id}.${ext}`;
}

/** Problems with the image files of ok logos: missing, or not matching their checksum. */
export function checkFiles(rows: LogoRow[], dir = LOGO_DIR): string[] {
  const errs: string[] = [];
  for (const r of rows) {
    if (r.status !== 'ok' || !r.image) continue;
    const f = new URL(r.image, dir);
    if (!existsSync(f)) { errs.push(`Logos: ${r.kind} ${r.id}: data/logos/${r.image} is missing`); continue; }
    if (fileSha256(readFileSync(f)) !== r.sha256) errs.push(`Logos: ${r.kind} ${r.id}: data/logos/${r.image} does not match its sha256`);
  }
  return errs;
}

/** Copies the logos the atlas uses into public/logos/, replacing whatever was there. */
export function copyToSite(atlas: Atlas, from = LOGO_DIR, to = SITE_LOGO_DIR) {
  rmSync(to, { recursive: true, force: true });
  mkdirSync(to, { recursive: true });
  for (const l of usedLogos(atlas)) cpSync(new URL(l.src.replace(/^logos\//, ''), from), new URL(l.src.replace(/^logos\//, ''), to));
}

const usedLogos = (atlas: Atlas) => [...Object.values(atlas.logos?.games ?? {}), ...Object.values(atlas.logos?.series ?? {})];

/** Sets each logo's ink tone from its image, so the page can put it on a plate that keeps it readable. */
export function addTones(atlas: Atlas, from = LOGO_DIR) {
  for (const l of usedLogos(atlas)) {
    const tone = inkTone(readFileSync(new URL(l.src.replace(/^logos\//, ''), from)));
    if (tone) l.tone = tone;
  }
}

export interface CommonsFile { file: string; missing: boolean; meta: ExtMetadata; templates: string[]; thumb?: string }

/** Files from one Commons API answer (prop=imageinfo|templates), keyed by the file name that was asked for. */
export function parseCommons(json: unknown, asked: string[]): Map<string, CommonsFile> {
  const q = (json as { query?: { normalized?: { from: string; to: string }[]; pages?: Record<string, {
    title: string; missing?: string; invalid?: string; templates?: { title: string }[];
    imageinfo?: { extmetadata?: ExtMetadata; thumburl?: string; url?: string }[];
  }> } }).query ?? {};
  const canon = new Map((q.normalized ?? []).map((n) => [n.from, n.to]));
  const pages = new Map(Object.values(q.pages ?? {}).map((p) => [p.title, p]));
  const out = new Map<string, CommonsFile>();
  for (const file of asked) {
    const title = `File:${file}`;
    const p = pages.get(canon.get(title) ?? title);
    const info = p?.imageinfo?.[0];
    out.set(file, {
      file, missing: !p || p.missing !== undefined || p.invalid !== undefined || !info,
      meta: info?.extmetadata ?? {}, templates: (p?.templates ?? []).map((t) => t.title),
      ...(info?.thumburl || info?.url ? { thumb: info.thumburl ?? info.url } : {}),
    });
  }
  return out;
}

/** The Commons API request for a batch of files (at most 50). */
export function commonsQuery(api: string, files: string[]): string {
  const q = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '1', prop: 'imageinfo|templates',
    iiprop: 'extmetadata|url', iiurlwidth: String(LOGO_WIDTH), iiextmetadatafilter: 'License|LicenseShortName|Artist|NonFree',
    tltemplates: DELETION_TEMPLATES.join('|'), tllimit: 'max', titles: files.map((f) => `File:${f}`).join('|'),
  });
  return `${api}?${q}`;
}
