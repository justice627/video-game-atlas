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

/** Cards in a cluster stack, and how far (in cells) each card behind peeks out up and to the right. */
export const STACK_MAX = 3;
const STEP = 3;
/** Stack images are square and padded so the front card sits at the center, over the cluster's point. */
export const STACK_SIZE = (GRID + 2 * (STACK_MAX - 1) * STEP) * SCALE;

/**
 * A cluster's image id: how many cards to draw (1 to STACK_MAX) and the distinct token ids of its games,
 * joined by ';'. The map builds the list with a cluster reducer, so the id changes when the cluster does.
 */
export const stackId = (cards: number, tokens: string[]) => `stk|${cards}|${tokens.join(';')}`;
export function parseStackId(id: string): { cards: number; tokens: TokenSpec[] } | undefined {
  const m = /^stk\|(\d+)\|(.*)$/.exec(id);
  if (!m) return undefined;
  // Merged sub-clusters can repeat a token; keep each once, in first-seen order.
  const tokens = [...new Set(m[2].split(';'))].map(parseTokenId).filter((t): t is TokenSpec => !!t);
  return { cards: Math.max(1, Math.min(STACK_MAX, Number(m[1]))), tokens };
}

/** Shown behind the front card when a cluster has more pins than distinct games, e.g. one series at one city. */
const CARD_BACK: RGB[] = [[0x33, 0x41, 0x5c], [0x24, 0x2f, 0x45]];

/**
 * A fanned stack: the first token in front, the next distinct tokens peeking out behind it, card backs
 * for the rest, each card further back a little darker.
 */
export function stackImage(s: { cards: number; tokens: TokenSpec[] }, roleColor: Record<Role, string>) {
  const size = STACK_SIZE;
  const data = new Uint8ClampedArray(size * size * 4);
  const card = GRID * SCALE;
  const front = (size - card) / 2;
  for (let k = s.cards - 1; k >= 0; k--) {
    const t = s.tokens[k];
    const img = t ? tokenImage(t, roleColor) : cardBack();
    const dim = 1 - 0.18 * k;
    const ox = front + k * STEP * SCALE;
    const oy = front - k * STEP * SCALE;
    for (let y = 0; y < card; y++) {
      for (let x = 0; x < card; x++) {
        const i = (y * card + x) * 4;
        if (!img.data[i + 3]) continue;
        const o = ((oy + y) * size + ox + x) * 4;
        data[o] = img.data[i] * dim; data[o + 1] = img.data[i + 1] * dim; data[o + 2] = img.data[i + 2] * dim; data[o + 3] = 255;
      }
    }
  }
  return { width: size, height: size, data };
}

function cardBack() {
  const size = GRID * SCALE;
  const data = new Uint8ClampedArray(size * size * 4);
  const last = GRID - 1;
  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      const ring = Math.min(gx, gy, last - gx, last - gy);
      if ((gx === 0 || gx === last) && (gy === 0 || gy === last)) continue;
      const c: RGB = ring === 0 ? [255, 255, 255] : ring === 1 ? CARD_BACK[0] : CARD_BACK[(gx + gy) % 2];
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
