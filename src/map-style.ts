// Pure helpers for the map: no MapLibre import, so tests can run them in Node.
import type { StyleSpecification } from 'maplibre-gl';
import type { Hit } from './filter.ts';

/**
 * Drops the basemap's shaded-relief raster layers: they refetch about 40 image tiles on every
 * zoom-out and add little to a map of game places (measured 2026-11-05, zoom-out requests 67 -> 23).
 */
export function withoutRelief(style: StyleSpecification): StyleSpecification {
  const relief = new Set(Object.entries(style.sources ?? {}).filter(([id, src]) => src.type === 'raster' && /shaded|hillshade|relief/i.test(id)).map(([id]) => id));
  if (!relief.size) return style;
  return {
    ...style,
    layers: style.layers.filter((l) => !('source' in l && typeof l.source === 'string' && relief.has(l.source))),
    sources: Object.fromEntries(Object.entries(style.sources).filter(([id]) => !relief.has(id))),
  };
}

/**
 * Each distinct area once. Many strategy games share the world box, and stacked translucent
 * fills both darken the map and cost a full-screen draw each (measured 2026-11-05: frames about 2x faster).
 */
export function distinctBoxes(es: Hit[][]): [number, number, number, number][] {
  return [...new Map(es.map((e) => e[0].link.bbox).filter((b): b is [number, number, number, number] => !!b).map((b) => [b.join(','), b])).values()];
}

