import { describe, expect, it } from 'vitest';
import { deflateSync } from 'node:zlib';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkFiles, checkLicence, commonsFileName, fileSha256, imageName, parseCommons, plain } from '../scripts/lib/logos.ts';
import { inkTone } from '../scripts/lib/png.ts';
import { readTables, type Tables } from '../scripts/lib/tables.ts';
import { buildAtlas, validate } from '../scripts/lib/dataset.ts';
import { gameLogo, logoHtml } from '../src/logo.ts';

const v = (value: string) => ({ value });

describe('logo licence check (rules section 8)', () => {
  it('accepts public domain, CC0, CC BY and CC BY-SA', () => {
    for (const l of ['pd', 'cc0', 'cc-by-4.0', 'cc-by-sa-3.0', 'cc-by-sa-4.0']) expect(checkLicence({ License: v(l) }, []).ok).toBe(true);
  });
  it('refuses other licences, missing ones, non-free files and files up for deletion', () => {
    expect(checkLicence({ License: v('cc-by-nc-4.0') }, [])).toMatchObject({ ok: false });
    expect(checkLicence({}, [])).toMatchObject({ ok: false, reason: expect.stringMatching(/no machine-readable licence/) });
    expect(checkLicence({ License: v('pd'), NonFree: v('true') }, [])).toMatchObject({ ok: false });
    expect(checkLicence({ License: v('pd') }, ['Template:Delete'])).toMatchObject({ ok: false, reason: expect.stringMatching(/Delete/) });
  });
  it('keeps the credit as plain text', () => {
    expect(checkLicence({ License: v('pd'), LicenseShortName: v('Public domain'), Artist: v('<a href="x">Ubisoft</a>') }, []))
      .toEqual({ ok: true, licence: 'pd', licenceName: 'Public domain', author: 'Ubisoft' });
    expect(plain('{{en:Game Freak}}, {{en:Nintendo}}')).toBe('Game Freak, Nintendo');
    expect(plain('<span>Unknown author</span><span>Unknown author</span>')).toBe('Unknown author');
  });
});

describe('Commons and Wikidata parsing', () => {
  it('reads file names from Wikidata logo values', () => {
    expect(commonsFileName('http://commons.wikimedia.org/wiki/Special:FilePath/Assassin%27s%20Creed%20logo.svg')).toBe("Assassin's Creed logo.svg");
  });
  it('maps answers back to the asked file names, through normalization, and spots missing files', () => {
    const json = { query: {
      normalized: [{ from: 'File:a_b.svg', to: 'File:A b.svg' }],
      pages: {
        1: { title: 'File:A b.svg', templates: [{ title: 'Template:Delete' }], imageinfo: [{ thumburl: 'https://upload.wikimedia.org/x/330px-A_b.svg.png', extmetadata: { License: v('pd') } }] },
        '-1': { title: 'File:Gone.png', missing: '' },
      },
    } };
    const out = parseCommons(json, ['a_b.svg', 'Gone.png']);
    expect(out.get('a_b.svg')).toMatchObject({ missing: false, templates: ['Template:Delete'], thumb: expect.stringContaining('330px') });
    expect(out.get('Gone.png')!.missing).toBe(true);
  });
  it('names local images after kind and id', () => {
    expect(imageName('game', 'hitman-3', 'https://upload.wikimedia.org/a/330px-H.svg.png')).toBe('game-hitman-3.png');
    expect(imageName('series', 'hitman', 'https://upload.wikimedia.org/a/H.jpeg')).toBe('series-hitman.jpg');
  });
});

/** A width x 1 RGBA PNG from a list of [r, g, b, a] pixels. */
function png(pixels: number[][]): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const b = Buffer.alloc(12 + data.length);
    b.writeUInt32BE(data.length, 0); b.write(type, 4, 'latin1'); data.copy(b, 8);
    return b; // CRC is not checked by the decoder
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(pixels.length, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.from([0, ...pixels.flat()]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

describe('ink tone', () => {
  const clear = [0, 0, 0, 0];
  it('tells dark ink, light ink and opaque images apart', () => {
    expect(inkTone(png([[10, 10, 10, 255], clear, clear]))).toBe('dark');
    expect(inkTone(png([[240, 240, 240, 255], clear, clear]))).toBe('light');
    expect(inkTone(png([[240, 240, 240, 255], [10, 10, 10, 255]]))).toBe('opaque');
    expect(inkTone(Buffer.from('not a png'))).toBeUndefined();
  });
});

describe('logo rows', () => {
  const tables = readTables();
  const row = { kind: 'game', id: 'hitman-3', file: 'Hitman 3 2021 vector logo.svg', licence: 'pd', licence_name: 'Public domain', image: 'game-hitman-3.png', sha256: 'a'.repeat(64), accessed: '2026-11-06', status: 'ok' };
  const errorsWith = (rows: Tables['logos']) => validate({ ...structuredClone(tables), logos: rows }).join('\n');

  it('the committed rows pass, with their files', () => {
    expect(validate(tables)).toEqual([]);
    expect(checkFiles(tables.logos)).toEqual([]);
  });
  it('refuses a non-free licence, an unknown game, a duplicate and an excluded row without a reason', () => {
    expect(errorsWith([{ ...row, licence: 'cc-by-nc-4.0' }])).toMatch(/not public domain, CC0, CC BY or CC BY-SA/);
    expect(errorsWith([{ ...row, id: 'no-such-game' }])).toMatch(/not on the Games sheet/);
    expect(errorsWith([row, row])).toMatch(/already has a logo/);
    expect(errorsWith([{ ...row, status: 'excluded' }])).toMatch(/needs the reason/);
  });
  it('catches an image that does not match its checksum', () => {
    const dir = mkdtempSync(join(tmpdir(), 'logos-'));
    writeFileSync(join(dir, 'game-hitman-3.png'), 'x');
    const url = pathToFileURL(dir + '/');
    expect(checkFiles([{ ...row, sha256: fileSha256(Buffer.from('x')) }], url)).toEqual([]);
    expect(checkFiles([row], url)[0]).toMatch(/does not match/);
  });
  it('builds logos beside the games, a game falling back to its series', () => {
    const atlas = buildAtlas(tables);
    const ac = atlas.games.find((g) => g.series === 'assassins-creed' && !atlas.logos!.games[g.id]);
    if (ac) expect(gameLogo(atlas.logos, ac)).toBe(atlas.logos!.series['assassins-creed']);
    expect(atlas.games.every((g) => !('logo' in g))).toBe(true);
    const t = structuredClone(tables);
    t.logos.forEach((l) => (l.status = 'excluded', l.note = 'test'));
    expect(Object.keys(buildAtlas(t).logos!.games)).toEqual([]);
  });
});

describe('logo markup', () => {
  const l = { src: 'logos/game-x.png', page: 'https://commons.wikimedia.org/wiki/File:X.png', licence: 'Public domain', author: 'A "B"', tone: 'dark' as const };
  it('links popup logos to Commons and escapes the credit', () => {
    const html = logoHtml(l, 'X & Y', { base: '/', link: true, cls: 'pop-logo' });
    expect(html).toContain('href="https://commons.wikimedia.org/wiki/File:X.png"');
    expect(html).toContain('alt="X &#38; Y logo"');
    expect(html).toContain('data-tone="dark"');
    expect(html).not.toContain('"B"');
  });
  it('gives list logos no link, and nothing without a logo', () => {
    expect(logoHtml(l, 'X', { base: '/', link: false, cls: 'li-logo' })).not.toContain('<a');
    expect(logoHtml(undefined, 'X', { base: '/', link: false, cls: 'li-logo' })).toBe('');
  });
});
