// Just enough PNG decoding to tell whether a logo's ink is dark or light: 8-bit, non-interlaced,
// any colour type. Anything else returns undefined and the logo is drawn without a plate.
import { inflateSync } from 'node:zlib';

export type Tone = 'dark' | 'light' | 'opaque';

/** RGBA pixels of a PNG, or undefined for a file this decoder doesn't handle. */
export function decodePng(buf: Buffer): { width: number; height: number; rgba: Uint8Array } | undefined {
  if (buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47) return undefined;
  let pos = 8, width = 0, height = 0, depth = 0, type = 0, interlace = 0;
  let palette: Buffer | undefined, trns: Buffer | undefined;
  const idat: Buffer[] = [];
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos), kind = buf.toString('latin1', pos + 4, pos + 8), data = buf.subarray(pos + 8, pos + 8 + len);
    if (kind === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); depth = data[8]; type = data[9]; interlace = data[12]; }
    else if (kind === 'PLTE') palette = data;
    else if (kind === 'tRNS') trns = data;
    else if (kind === 'IDAT') idat.push(data);
    else if (kind === 'IEND') break;
    pos += 12 + len;
  }
  const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[type];
  if (depth !== 8 || interlace !== 0 || !channels || !width || !height) return undefined;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const px = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? px[y * stride + x - channels] : 0;
      const b = y ? px[(y - 1) * stride + x] : 0;
      const c = y && x >= channels ? px[(y - 1) * stride + x - channels] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const pred = f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : f === 4 ? (pa <= pb && pa <= pc ? a : pb <= pc ? b : c) : 0;
      px[y * stride + x] = (src[x] + pred) & 255;
    }
  }
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const s = px.subarray(i * channels, (i + 1) * channels);
    let r: number, g: number, b: number, a = 255;
    if (type === 3) {
      [r, g, b] = palette ? [palette[s[0] * 3], palette[s[0] * 3 + 1], palette[s[0] * 3 + 2]] : [0, 0, 0];
      if (trns && s[0] < trns.length) a = trns[s[0]];
    } else if (type === 0 || type === 4) { r = g = b = s[0]; if (type === 4) a = s[1]; }
    else { [r, g, b] = [s[0], s[1], s[2]]; if (type === 6) a = s[3]; }
    rgba.set([r, g, b, a], i * 4);
  }
  return { width, height, rgba };
}

/**
 * dark: dark ink on a transparent background (needs a light plate); light: light ink (needs a dark plate);
 * opaque: the image brings its own background. Undefined when the file can't be read.
 */
export function inkTone(buf: Buffer): Tone | undefined {
  const img = decodePng(buf);
  if (!img) return undefined;
  let weight = 0, lum = 0, clear = 0;
  const n = img.width * img.height;
  for (let i = 0; i < n; i++) {
    const [r, g, b, a] = img.rgba.subarray(i * 4, i * 4 + 4);
    if (a < 128) { clear++; continue; }
    weight += a; lum += a * (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  }
  if (clear < n * 0.05 || !weight) return 'opaque';
  return lum / weight > 0.6 ? 'light' : 'dark';
}
