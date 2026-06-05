// 64-bit average-hash (aHash/pHash) implementation for image duplicate detection.
// Uses sharp to downscale to 8x8 grayscale, then thresholds at the mean.

import sharp from "sharp";

/** Parse a `data:<mime>;base64,<payload>` URL into a Buffer. Throws on invalid. */
function dataUrlToBuffer(dataUrl: string): Buffer {
  const m = /^data:[^;]+;base64,(.+)$/.exec(dataUrl);
  if (!m) throw new Error("invalid_data_url");
  return Buffer.from(m[1], "base64");
}

/**
 * Compute a 64-bit perceptual hash as a 16-char hex string.
 * Resizes the image to 8x8 grayscale, then sets each bit to 1 when the
 * pixel is >= the mean of all 64 pixels.
 */
export async function computePHash(dataUrl: string): Promise<string> {
  const buf = dataUrlToBuffer(dataUrl);
  const raw = await sharp(buf)
    .removeAlpha()
    .grayscale()
    .resize(8, 8, { fit: "fill", kernel: "lanczos3" })
    .raw()
    .toBuffer();
  // raw is exactly 64 bytes (8x8 single-channel)
  let sum = 0;
  for (let i = 0; i < 64; i++) sum += raw[i];
  const mean = sum / 64;
  let hex = "";
  for (let nibble = 0; nibble < 16; nibble++) {
    let v = 0;
    for (let b = 0; b < 4; b++) {
      const idx = nibble * 4 + b;
      if (raw[idx] >= mean) v |= 1 << (3 - b);
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
