// 64-bit average-hash (aHash) implementation using jimp (pure JS, no native deps).
import Jimp from "jimp";

/** Parse a `data:<mime>;base64,<payload>` URL into a Buffer. */
function dataUrlToBuffer(dataUrl: string): Buffer {
  const m = /^data:[^;]+;base64,(.+)$/.exec(dataUrl);
  if (!m) throw new Error("invalid_data_url");
  return Buffer.from(m[1], "base64");
}

/**
 * Compute a 64-bit perceptual hash as a 16-char hex string.
 */
export async function computePHash(dataUrl: string): Promise<string> {
  const buf = dataUrlToBuffer(dataUrl);
  const img = await Jimp.read(buf);
  img.resize(8, 8).grayscale();

  const raw: number[] = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const pixel = img.getPixelColor(x, y);
      const r = (pixel >> 24) & 0xff;
      raw.push(r);
    }
  }

  const mean = raw.reduce((a, b) => a + b, 0) / 64;

  let hex = "";
  for (let nibble = 0; nibble < 16; nibble++) {
    let v = 0;
    for (let b = 0; b < 4; b++) {
      if (raw[nibble * 4 + b] >= mean) v |= 1 << (3 - b);
    }
    hex += v.toString(16);
  }
  return hex;
}

/** Hamming distance between two equal-length hex hash strings. */
export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) return Number.MAX_SAFE_INTEGER;
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      dist += x & 1;
      x >>= 1;
    }
  }
  return dist;
}

/** Returns the minimum Hamming distance between `hash` and any of `hashes`. */
export function minHammingDistance(hash: string, hashes: string[]): number {
  let min = Number.MAX_SAFE_INTEGER;
  for (const h of hashes) {
    const d = hammingDistance(hash, h);
    if (d < min) min = d;
  }
  return min;
}
