// Pixel-art map tokens: one small sprite per game, generated from its id. No canvas or MapLibre
// import, so tests run it in Node; the map hands the RGBA buffer straight to addImage.
import type { Role } from './types.ts';

/** Sprite cells per side, inside a two-cell frame (white outline, then the role color). */
export const SPRITE = 8;
export const GRID = SPRITE + 4;
/** Image pixels per cell. The map registers images at pixelRatio 2, so a token is GRID * SCALE / 2 CSS px. */
export const SCALE = 5;

/** FNV-1a: small, stable across runs and platforms. */
export function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** mulberry32 seeded from the hash, so a sprite never changes between builds. */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * SPRITE x SPRITE shade indices (0 = background, 1 = dark, 2 = mid, 3 = light), mirrored left to right
 * so the result reads as a creature or an emblem rather than noise.
 */
export function spriteCells(key: string): Uint8Array {
  const r = rng(hash(key));
  const cells = new Uint8Array(SPRITE * SPRITE);
  const half = SPRITE / 2;
  for (let y = 0; y < SPRITE; y++) {
    for (let x = 0; x < half; x++) {
      // Denser toward the middle column, sparser at the edges: keeps a silhouette.
      const fill = r() < 0.38 + 0.12 * (x / half);
      const shade = fill ? 1 + Math.floor(r() * 3) : 0;
      cells[y * SPRITE + x] = shade;
      cells[y * SPRITE + (SPRITE - 1 - x)] = shade;
    }
  }
  return cells;
}

type RGB = [number, number, number];

function hsl(h: number, s: number, l: number): RGB {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

function hex(c: string): RGB {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Four colors in one hue: background, dark, mid, light. Games in a series share the hue. */
export function palette(hueKey: string): RGB[] {
  const h = hash(hueKey) % 360;
  return [hsl(h, 0.35, 0.16), hsl(h, 0.65, 0.38), hsl(h, 0.75, 0.56), hsl(h, 0.85, 0.78)];
}

export interface TokenSpec { sprite: string; hue: string; role: Role }

/** Image ids carry everything needed to draw the token, so the map can generate it on first use. */
export const tokenId = (t: TokenSpec) => `tok|${t.sprite}|${t.hue}|${t.role}`;
export function parseTokenId(id: string): TokenSpec | undefined {
  const [p, sprite, hue, role] = id.split('|');
  return p === 'tok' && sprite && hue && role ? { sprite, hue, role: role as Role } : undefined;
}

/** RGBA pixels for one token, in the { width, height, data } shape MapLibre's addImage takes. */
export function tokenImage(t: TokenSpec, roleColor: Record<Role, string>) {
  const size = GRID * SCALE;
  const data = new Uint8ClampedArray(size * size * 4);
  const cells = spriteCells(t.sprite);
  const pal = palette(t.hue);
  const frame = hex(roleColor[t.role] ?? '#666666');
  const last = GRID - 1;
  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      const ring = Math.min(gx, gy, last - gx, last - gy);
      const corner = (gx === 0 || gx === last) && (gy === 0 || gy === last);
      let c: RGB | undefined;
      if (corner) c = undefined; // clipped corners: a pixel-rounded tile
      else if (ring === 0) c = [255, 255, 255];
      else if (ring === 1) c = frame;
      else c = pal[cells[(gy - 2) * SPRITE + (gx - 2)]];
      if (!c) continue;
      for (let py = 0; py < SCALE; py++) {
        for (let px = 0; px < SCALE; px++) {
          const o = ((gy * SCALE + py) * size + gx * SCALE + px) * 4;
          data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; data[o + 3] = 255;
        }
      }
    }
  }
  return { width: size, height: size, data };
}
