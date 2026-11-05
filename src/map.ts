import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, MapGeoJSONFeature, StyleSpecification } from 'maplibre-gl';
import type { Point } from 'geojson';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre 6 runs its tile parsing in a module worker that the app must point it to.
// Vite copies the self-contained worker file into the build and gives back its URL.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';

maplibregl.setWorkerUrl(workerUrl);
import type { Hit } from './filter.ts';
import type { Role } from './types.ts';
import { ROLE_LABEL } from './types.ts';
import { formatSpan, formatYear } from './timeline.ts';

export const ROLE_COLOR: Record<Role, string> = {
  setting: '#2a6fdb',
  level: '#d9771e',
  arena: '#1f9d63',
  inspiration: '#9b45c2',
  strategy: '#d23c4b',
};

const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';
const FALLBACK_STYLE: StyleSpecification = {
  version: 8, glyphs: GLYPHS, sources: {},
  layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#dde5ea' } }],
};

async function loadStyle(): Promise<string | StyleSpecification> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 6000);
    const res = await fetch(STYLE_URL, { signal: ctl.signal });
    clearTimeout(t);
    if (res.ok) return (await res.json()) as StyleSpecification;
  } catch { /* offline or blocked: fall through */ }
  console.info('Basemap unavailable, using plain background.');
  return FALLBACK_STYLE;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };

function hitHtml(h: Hit): string {
  const l = h.link;
  const where = l.fictionalName
    ? `${esc(l.fictionalName)} <span class="muted">(based on ${esc(l.place)})</span>`
    : esc(l.place);
  const title = h.game.wikipedia
    ? `<a href="${esc(h.game.wikipedia)}" target="_blank" rel="noopener">${esc(h.game.title)}</a>`
    : esc(h.game.title);
  const when = l.span
    ? (l.span.label ? `${esc(l.span.label)} (${formatSpan(l.span)})` : formatSpan(l.span))
    : l.timeType === 'sandbox' ? 'Across eras (sandbox), years not yet set' : 'Not dated';
  const sources = l.sources.map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(host(u))}</a>`).join(', ');
  return `<div class="pop-item">
    <div class="pop-title">${title}${h.game.year ? ` <span class="muted">(${h.game.year})</span>` : ''}</div>
    <div><span class="dot" style="background:${ROLE_COLOR[l.role]}"></span>${ROLE_LABEL[l.role]}${l.nameInGame ? `: ${esc(l.nameInGame)}` : ''}</div>
    <div>${where}${l.approxPlace ? ' <span class="muted">· approximate location</span>' : ''}</div>
    <div class="muted">${l.timeType === 'sandbox' ? when : `Set in ${when}`}${h.approxTime && l.span ? ' · broad period' : ''}</div>
    <div class="muted">Source (${l.confidence} confidence): ${sources}</div>
  </div>`;
}

/** Several games at one place in one series: one popup block listing each game and the name it uses. */
function groupHtml(group: Hit[], seriesName: (id: string) => string | undefined): string {
  if (group.length === 1) return hitHtml(group[0]);
  const first = group[0].link;
  const series = group[0].game.series ? seriesName(group[0].game.series) : undefined;
  const items = [...group].sort((a, b) => (a.game.year ?? 0) - (b.game.year ?? 0)).map((h) => {
    const t = h.game.wikipedia ? `<a href="${esc(h.game.wikipedia)}" target="_blank" rel="noopener">${esc(h.game.title)}</a>` : esc(h.game.title);
    const as = h.link.nameInGame && h.link.nameInGame !== first.place ? ` · as "${esc(h.link.nameInGame)}"` : '';
    const when = h.link.span ? ` · ${formatSpan(h.link.span)}` : '';
    return `<li>${t}${as}<span class="muted">${when}</span></li>`;
  }).join('');
  return `<div class="pop-item">
    <div class="pop-title">${esc(series ?? group[0].game.title)} <span class="muted">(${group.length} games)</span></div>
    <div><span class="dot" style="background:${ROLE_COLOR[first.role]}"></span>${ROLE_LABEL[first.role]}: ${esc(first.place)}</div>
    <ul class="pop-list">${items}</ul>
  </div>`;
}

export interface AtlasMap {
  /** Each entry is drawn as one pin: a single hit, or a collapsed series group. */
  setHits(entries: Hit[][]): void;
  focus(hits: Hit[]): void;
  ready: Promise<void>;
}

export function mountMap(container: HTMLElement, seriesName: (id: string) => string | undefined = () => undefined): AtlasMap {
  let entries: Hit[][] = [];
  let popup: maplibregl.Popup | null = null;
  let map!: maplibregl.Map;

  const showPopup = (lngLat: maplibregl.LngLatLike, groups: Hit[][]) => {
    popup?.remove();
    const more = groups.length > 30 ? `<div class="muted">…and ${groups.length - 30} more</div>` : '';
    popup = new maplibregl.Popup({ maxWidth: '340px', className: 'atlas-pop' })
      .setLngLat(lngLat)
      .setHTML(`<div class="pop-scroll">${groups.slice(0, 30).map((g) => groupHtml(g, seriesName)).join('')}${more}</div>`)
      .addTo(map);
  };
  const featureHits = (fs: MapGeoJSONFeature[]) => fs.map((f) => entries[f.properties!.i as number]).filter(Boolean);

  const ready = loadStyle().then((style) => new Promise<void>((resolve) => {
    map = new maplibregl.Map({ container, style, center: [15, 30], zoom: 1.4, attributionControl: { compact: true } });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.on('load', () => {
      map.addSource('regions', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'regions-fill', type: 'fill', source: 'regions', paint: { 'fill-color': ROLE_COLOR.strategy, 'fill-opacity': 0.05 } });
      map.addLayer({ id: 'regions-line', type: 'line', source: 'regions', paint: { 'line-color': ROLE_COLOR.strategy, 'line-opacity': 0.5, 'line-dasharray': [2, 2] } });

      map.addSource('pins', { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, cluster: true, clusterRadius: 36, clusterMaxZoom: 12 });
      map.addLayer({
        id: 'clusters', type: 'circle', source: 'pins', filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#33415c', 'circle-opacity': 0.85, 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5,
          'circle-radius': ['step', ['get', 'point_count'], 13, 10, 17, 50, 22, 150, 27],
        },
      });
      map.addLayer({
        id: 'cluster-count', type: 'symbol', source: 'pins', filter: ['has', 'point_count'],
        layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': ['Noto Sans Regular'], 'text-size': 12 },
        paint: { 'text-color': '#fff' },
      });
      const color: maplibregl.ExpressionSpecification = ['match', ['get', 'kind'], ...Object.entries(ROLE_COLOR).flat(), '#666'] as never;
      map.addLayer({
        id: 'pins', type: 'circle', source: 'pins', filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-radius': ['case', ['get', 'coarse'], 7, 6],
          'circle-color': color,
          'circle-opacity': ['case', ['get', 'coarse'], 0.12, 0.95],
          'circle-stroke-color': color,
          'circle-stroke-width': ['case', ['get', 'coarse'], 2, 1.5],
          'circle-stroke-opacity': ['case', ['get', 'coarse'], 0.7, 1],
        },
      });

      map.on('click', 'pins', (e) => showPopup(e.lngLat, featureHits(map.queryRenderedFeatures(e.point, { layers: ['pins'] }))));
      map.on('click', 'clusters', async (e) => {
        const f = e.features![0];
        const src = map.getSource('pins') as GeoJSONSource;
        const id = f.properties!.cluster_id as number;
        const leaves = (await src.getClusterLeaves(id, 200, 0)) as MapGeoJSONFeature[];
        const coords = leaves.map((l) => (l.geometry as Point).coordinates);
        const samePlace = coords.every((c) => Math.abs(c[0] - coords[0][0]) < 1e-3 && Math.abs(c[1] - coords[0][1]) < 1e-3);
        if (samePlace) return showPopup(coords[0] as [number, number], featureHits(leaves));
        const zoom = await src.getClusterExpansionZoom(id);
        map.easeTo({ center: (f.geometry as Point).coordinates as [number, number], zoom });
      });
      for (const l of ['pins', 'clusters']) {
        map.on('mouseenter', l, () => (map.getCanvas().style.cursor = 'pointer'));
        map.on('mouseleave', l, () => (map.getCanvas().style.cursor = ''));
      }
      // Marks the map ready once its data has rendered; browser tests wait for this.
      map.on('idle', () => { container.dataset.mapReady = '1'; });
      resolve();
    });
  }));

  const toGeo = (es: Hit[][]) => ({
    pins: {
      type: 'FeatureCollection' as const,
      // Areas (bbox) are drawn as regions only: their centre is not a place, so no pin.
      features: es.map((e) => e[0]).flatMap((h, i) => (h.link.bbox ? [] : [{
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [h.link.lon, h.link.lat] },
        properties: { i, kind: h.link.role, coarse: h.link.approxPlace || h.approxTime },
      }])),
    },
    regions: {
      type: 'FeatureCollection' as const,
      features: es.map((e) => e[0]).filter((h) => h.link.bbox).map((h) => {
        const [w, s, e, n] = h.link.bbox!;
        return {
          type: 'Feature' as const, properties: {},
          geometry: { type: 'Polygon' as const, coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] },
        };
      }),
    },
  });

  return {
    ready,
    setHits(next) {
      entries = next;
      popup?.remove();
      void ready.then(() => {
        const g = toGeo(entries);
        (map.getSource('pins') as GeoJSONSource).setData(g.pins);
        (map.getSource('regions') as GeoJSONSource).setData(g.regions);
      });
    },
    focus(gameHits) {
      void ready.then(() => {
        const area = gameHits.find((h) => h.link.bbox);
        if (area) {
          const [w, so, e, n] = area.link.bbox!;
          map.fitBounds([[w, so], [e, n]], { padding: 20 });
          showPopup([area.link.lon, area.link.lat], [[area]]);
          return;
        }
        const pts = gameHits.map((h) => [h.link.lon, h.link.lat] as [number, number]);
        if (pts.length === 1) map.flyTo({ center: pts[0], zoom: Math.max(map.getZoom(), gameHits[0].link.approxPlace ? 3 : 8) });
        else {
          const b = new maplibregl.LngLatBounds(pts[0], pts[0]);
          pts.forEach((p) => b.extend(p));
          map.fitBounds(b, { padding: 60, maxZoom: 9 });
        }
        // Everything listed at the first place: one game's link, or a whole series there when collapsed.
        const here = gameHits.filter((h) => h.link.lon === pts[0][0] && h.link.lat === pts[0][1]);
        showPopup(pts[0], here.length > 1 && new Set(here.map((h) => h.game.id)).size > 1 ? [here] : here.map((h) => [h]));
      });
    },
  };
}

export { formatYear };
