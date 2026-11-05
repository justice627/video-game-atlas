import { describe, expect, it } from 'vitest';
import type { StyleSpecification } from 'maplibre-gl';
import { distinctBoxes, withoutRelief } from '../src/map-style.ts';
import type { Hit } from '../src/filter.ts';

describe('map style helpers', () => {
  it('drops shaded-relief raster layers and their source, nothing else', () => {
    // The shape of OpenFreeMap liberty (2026-11): a ne2_shaded raster source drawn by layer natural_earth.
    const style = {
      version: 8,
      sources: { ne2_shaded: { type: 'raster', tiles: ['x'] }, openmaptiles: { type: 'vector', url: 'y' } },
      layers: [
        { id: 'background', type: 'background' },
        { id: 'natural_earth', type: 'raster', source: 'ne2_shaded' },
        { id: 'water', type: 'fill', source: 'openmaptiles', 'source-layer': 'water' },
      ],
    } as unknown as StyleSpecification;
    const out = withoutRelief(style);
    expect(out.layers.map((l) => l.id)).toEqual(['background', 'water']);
    expect(Object.keys(out.sources)).toEqual(['openmaptiles']);
    const plain = { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background' }] } as unknown as StyleSpecification;
    expect(withoutRelief(plain)).toBe(plain);
  });

  it('draws each distinct area once', () => {
    const hit = (bbox?: [number, number, number, number]) => [{ link: { bbox } }] as unknown as Hit[];
    const world: [number, number, number, number] = [-180, -60, 180, 75];
    expect(distinctBoxes([hit(world), hit([...world]), hit(), hit([-10, 35, 40, 70]), hit(world)])).toEqual([world, [-10, 35, 40, 70]]);
  });
});
