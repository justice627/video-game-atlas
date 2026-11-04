import maplibregl, { type GeoJSONSource, type MapGeoJSONFeature, type StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Hit } from './filter.ts';
import type { Kind } from './types.ts';
import { KIND_LABEL } from './types.ts';
import { formatSpan, formatYear } from './timeline.ts';

export const KIND_COLOR: Record<Kind, string> = {
  setting: '#2a6fdb',
  level: '#d9771e',
  arena: '#1f9d63',
  inspiration: '#9b45c2',
  strategy_map: '#d23c4b',
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

function hitHtml(h: Hit): string {
  const p = h.placement;
  const where = p.fictionalName
    ? `${esc(p.fictionalName)} <span class="muted">(based on ${esc(p.place)})</span>`
    : esc(p.place);
  const title = h.game.wikipedia
    ? `<a href="${esc(h.game.wikipedia)}" target="_blank" rel="noopener">${esc(h.game.title)}</a>`
    : esc(h.game.title);
  return `<div class="pop-item">
    <div class="pop-title">${title}${h.game.year ? ` <span class="muted">(${h.game.year})</span>` : ''}</div>
    <div><span class="dot" style="background:${KIND_COLOR[p.kind]}"></span>${KIND_LABEL[p.kind]}${p.levelName ? `: ${esc(p.levelName)}` : ''}</div>
    <div>${where}${p.coarse ? ' <span class="muted">· approximate pin</span>' : ''}</div>
    <div class="muted">Set in ${h.matched.map((s) => esc(s.label && !/^-?\d+$/.test(s.label) ? `${s.label} (${formatSpan(s)})` : formatSpan(s))).join(', ')}</div>
    ${h.game.qid ? `<div class="muted"><a href="https://www.wikidata.org/wiki/${h.game.qid}" target="_blank" rel="noopener">Wikidata ${h.game.qid}</a></div>` : '<div class="muted">Hand-curated</div>'}
  </div>`;
}

export interface AtlasMap {
  setHits(hits: Hit[]): void;
  focus(hits: Hit[]): void;
  ready: Promise<void>;
}

export function mountMap(container: HTMLElement): AtlasMap {
  let hits: Hit[] = [];
  let popup: maplibregl.Popup | null = null;
  let map!: maplibregl.Map;

  const showPopup = (lngLat: maplibregl.LngLatLike, list: Hit[]) => {
    popup?.remove();
    const more = list.length > 30 ? `<div class="muted">…and ${list.length - 30} more</div>` : '';
    popup = new maplibregl.Popup({ maxWidth: '320px', className: 'atlas-pop' })
      .setLngLat(lngLat)
      .setHTML(`<div class="pop-scroll">${list.slice(0, 30).map(hitHtml).join('')}${more}</div>`)
      .addTo(map);
  };
  const featureHits = (fs: MapGeoJSONFeature[]) => fs.map((f) => hits[f.properties!.i as number]).filter(Boolean);

  const ready = loadStyle().then((style) => new Promise<void>((resolve) => {
    map = new maplibregl.Map({ container, style, center: [15, 30], zoom: 1.4, attributionControl: { compact: true } });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.on('load', () => {
      map.addSource('regions', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'regions-fill', type: 'fill', source: 'regions', paint: { 'fill-color': KIND_COLOR.strategy_map, 'fill-opacity': 0.05 } });
      map.addLayer({ id: 'regions-line', type: 'line', source: 'regions', paint: { 'line-color': KIND_COLOR.strategy_map, 'line-opacity': 0.5, 'line-dasharray': [2, 2] } });

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
      const color: maplibregl.ExpressionSpecification = ['match', ['get', 'kind'], ...Object.entries(KIND_COLOR).flat(), '#666'] as never;
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
        const coords = leaves.map((l) => (l.geometry as GeoJSON.Point).coordinates);
        const samePlace = coords.every((c) => Math.abs(c[0] - coords[0][0]) < 1e-3 && Math.abs(c[1] - coords[0][1]) < 1e-3);
        if (samePlace) return showPopup(coords[0] as [number, number], featureHits(leaves));
        const zoom = await src.getClusterExpansionZoom(id);
        map.easeTo({ center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom });
      });
      for (const l of ['pins', 'clusters']) {
        map.on('mouseenter', l, () => (map.getCanvas().style.cursor = 'pointer'));
        map.on('mouseleave', l, () => (map.getCanvas().style.cursor = ''));
      }
      resolve();
    });
  }));

  const toGeo = (hs: Hit[]) => ({
    pins: {
      type: 'FeatureCollection' as const,
      features: hs.map((h, i) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [h.placement.lon, h.placement.lat] },
        properties: { i, kind: h.placement.kind, coarse: h.placement.coarse },
      })),
    },
    regions: {
      type: 'FeatureCollection' as const,
      features: hs.filter((h) => h.placement.bbox).map((h) => {
        const [w, s, e, n] = h.placement.bbox!;
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
      hits = next;
      popup?.remove();
      void ready.then(() => {
        const g = toGeo(hits);
        (map.getSource('pins') as GeoJSONSource).setData(g.pins);
        (map.getSource('regions') as GeoJSONSource).setData(g.regions);
      });
    },
    focus(gameHits) {
      void ready.then(() => {
        const pts = gameHits.map((h) => [h.placement.lon, h.placement.lat] as [number, number]);
        if (pts.length === 1) map.flyTo({ center: pts[0], zoom: Math.max(map.getZoom(), gameHits[0].placement.coarse ? 3 : 8) });
        else {
          const b = new maplibregl.LngLatBounds(pts[0], pts[0]);
          pts.forEach((p) => b.extend(p));
          map.fitBounds(b, { padding: 60, maxZoom: 9 });
        }
        showPopup(pts[0], [gameHits[0]]);
      });
    },
  };
}

export { formatYear };
