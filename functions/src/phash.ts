// 256-bit dHash (difference hash) using jimp (pure JS, no native deps).
// Encodes brightness gradient between horizontally adjacent pixels at 17x16
// grayscale → 16*16 = 256 bits = 64 hex chars. More sensitive to small content
// changes than 8x8 aHash, while still robust to compression/resize noise.
import Jimp from "jimp";

/** Parse a `data:<mime>;base64,<payload>` URL into a Buffer. */
function dataUrlToBuffer(dataUrl: string): Buffer {
  const m = /^data:[^;]+;base64,(.+)$/.exec(dataUrl);
  if (!m) throw new Error("invalid_data_url");
  return Buffer.from(m[1], "base64");
}

/**
 * Compute a 256-bit perceptual hash (dHash) as a 64-char hex string.
 */
export async function computePHash(dataUrl: string): Promise<string> {
  const buf = dataUrlToBuffer(dataUrl);
  const img = await Jimp.read(buf);
  // 17 wide × 16 tall → produces 16×16 = 256 difference bits.
  img.resize(17, 16).grayscale();

  // Extract red channel (grayscale → R=G=B) for each pixel.
  const px: number[] = new Array(17 * 16);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 17; x++) {
      const c = img.getPixelColor(x, y);
      px[y * 17 + x] = (c >> 24) & 0xff;
    }
  }

  // For each row, compare adjacent pixels → 16 bits per row × 16 rows = 256 bits.
  const bits: number[] = new Array(256);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const left = px[y * 17 + x];
      const right = px[y * 17 + x + 1];
      bits[y * 16 + x] = left < right ? 1 : 0;
    }
  }

  // Pack into 64 hex nibbles (4 bits each).
  let hex = "";
  for (let nibble = 0; nibble < 64; nibble++) {
    let v = 0;
    for (let b = 0; b < 4; b++) {
      if (bits[nibble * 4 + b]) v |= 1 << (3 - b);
    }
    hex += v.toString(16);
  }
  return hex;
}

/** Hamming distance between two equal-length hex hash strings.
 * Returns MAX_SAFE_INTEGER for mismatched lengths so legacy 16-char hashes
 * are auto-excluded from comparison against new 64-char hashes. */
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
