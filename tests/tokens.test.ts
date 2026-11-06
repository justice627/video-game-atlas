import { describe, expect, it } from 'vitest';
import { GRID, SCALE, SPRITE, STACK_SIZE, parseStackId, parseTokenId, spriteCells, stackId, stackImage, tokenId, tokenImage } from '../src/tokens.ts';
import type { Role } from '../src/types.ts';

// src/map.ts imports MapLibre, which doesn't load in Node; the frame only needs some role colors.
const ROLE_COLOR = { world: '#2a6fdb', level: '#d9771e', map: '#6b5bd6', venue: '#1f9d63', stage: '#b0457a', strategy: '#d23c4b' } satisfies Record<Role, string>;

const px = (img: ReturnType<typeof tokenImage>, cx: number, cy: number) => {
  const o = (cy * SCALE * img.width + cx * SCALE) * 4;
  return [...img.data.slice(o, o + 4)];
};

describe('pixel tokens', () => {
  it('draws the same sprite for the same id on every run', () => {
    expect(spriteCells('gta-vice-city')).toEqual(spriteCells('gta-vice-city'));
    // Pinned so an accidental change to the generator shows up as a test failure.
    expect([...spriteCells('gta-vice-city')].join('')).toMatchInlineSnapshot(`"1021120100311300130000310000000001300310021111202111111230022003"`);
  });

  it('draws different sprites for different games', () => {
    expect(spriteCells('gta-vice-city')).not.toEqual(spriteCells('assassins-creed-ii'));
  });

  it('mirrors each sprite left to right', () => {
    const c = spriteCells('civilization-vi');
    for (let y = 0; y < SPRITE; y++) for (let x = 0; x < SPRITE; x++) expect(c[y * SPRITE + x]).toBe(c[y * SPRITE + SPRITE - 1 - x]);
  });

  it('frames the sprite in white and then the role color, with clipped corners', () => {
    const img = tokenImage({ sprite: 'a', hue: 'b', role: 'level' }, ROLE_COLOR);
    expect(img.width).toBe(GRID * SCALE);
    expect(img.data.length).toBe(img.width * img.height * 4);
    expect(px(img, 0, 0)[3]).toBe(0);
    expect(px(img, 0, 5)).toEqual([255, 255, 255, 255]);
    expect(px(img, 1, 5)).toEqual([0xd9, 0x77, 0x1e, 255]);
  });

  it('round-trips the image id', () => {
    const spec = { sprite: 'hitman-3', hue: 'hitman', role: 'world' as const };
    expect(parseTokenId(tokenId(spec))).toEqual(spec);
    expect(parseTokenId('marker-15')).toBeUndefined();
  });

  it('reads a stack id back, each token once and the card count clamped', () => {
    const a = tokenId({ sprite: 'hitman-3', hue: 'hitman', role: 'world' });
    const b = tokenId({ sprite: 'hitman-2', hue: 'hitman', role: 'level' });
    const s = parseStackId(stackId(7, [a, b, a]))!;
    expect(s.cards).toBe(3);
    expect(s.tokens.map(tokenId)).toEqual([a, b]);
    expect(parseStackId(a)).toBeUndefined();
  });

  it('puts the first token in front, centered, and fills missing games with card backs', () => {
    const t = { sprite: 'a', hue: 'b', role: 'level' as const };
    const img = stackImage({ cards: 3, tokens: [t] }, ROLE_COLOR);
    expect(img.width).toBe(STACK_SIZE);
    const card = GRID * SCALE;
    const front = (STACK_SIZE - card) / 2;
    const at = (x: number, y: number) => [...img.data.slice((y * STACK_SIZE + x) * 4, (y * STACK_SIZE + x) * 4 + 4)];
    // The front card's role-color frame, undimmed, one cell in from its left edge.
    expect(at(front + SCALE, front + card / 2)).toEqual([0xd9, 0x77, 0x1e, 255]);
    // The last card back peeks out at the top right, behind the front card.
    expect(at(STACK_SIZE - card / 2, SCALE + 1)[3]).toBe(255);
    // Bottom-left corner of the image stays transparent: the fan only goes up and right.
    expect(at(1, STACK_SIZE - 2)[3]).toBe(0);
  });
});
