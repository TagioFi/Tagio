/**
 * Dependency-free QR encoder (byte mode) — spec Module 4's scan-to-pay codes.
 *
 * Deliberately hand-rolled rather than pulled from npm: `bun install` in this
 * repo aborts on utf-8-validate, so a new dependency is a build risk, and the
 * only QR package already in node_modules (qrcode.react@1.0.1) peer-depends on
 * React <=17 while this app is on 19.
 *
 * Byte mode only, which is all a `solana:` pay URI needs. Follows ISO/IEC
 * 18004 the same way Nayuki's reference implementation does.
 */

export type Ecc = "L" | "M" | "Q" | "H";

const ECC_ORDINAL: Record<Ecc, number> = { L: 0, M: 1, Q: 2, H: 3 };
// Format-info uses its own ordering (M, L, H, Q), not the numeric ordinal above.
const ECC_FORMAT_BITS: Record<Ecc, number> = { L: 1, M: 0, Q: 3, H: 2 };

// Indexed [eccOrdinal][version]; index 0 of each row is unused padding.
const ECC_CODEWORDS_PER_BLOCK: number[][] = [
  [
    -1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30,
    30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
  ],
  [
    -1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28,
    28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
  ],
  [
    -1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30,
    30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
  ],
  [
    -1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30,
    30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
  ],
];

const NUM_ECC_BLOCKS: number[][] = [
  [
    -1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14,
    15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25,
  ],
  [
    -1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23,
    25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49,
  ],
  [
    -1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34,
    34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68,
  ],
  [
    -1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35,
    37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81,
  ],
];

/** Total raw modules available for data+ECC codewords, before function patterns. */
function rawDataModules(version: number): number {
  const size = version * 4 + 17;
  let result = size * size;
  result -= 8 * 8 * 3; // three finder patterns + their separators/format areas
  result -= 15 * 2 + 1; // format information
  result -= (size - 16) * 2; // timing patterns

  if (version >= 2) {
    const numAlign = Math.floor(version / 7) + 2;
    result -= (numAlign - 1) * (numAlign - 1) * 25; // alignment patterns
    result -= (numAlign - 2) * 2 * 20; // alignment overlapping timing
    if (version >= 7) result -= 6 * 3 * 2; // version information
  }
  return result;
}

const dataCodewords = (version: number, ecc: Ecc): number => {
  const o = ECC_ORDINAL[ecc];
  return (
    Math.floor(rawDataModules(version) / 8) -
    ECC_CODEWORDS_PER_BLOCK[o][version] * NUM_ECC_BLOCKS[o][version]
  );
};

/* ---------- GF(256) Reed-Solomon ---------- */

function gfMul(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

function rsDivisor(degree: number): number[] {
  const result = new Array(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = gfMul(result[j], root);
      if (j + 1 < degree) result[j] ^= result[j + 1];
    }
    root = gfMul(root, 0x02);
  }
  return result;
}

function rsRemainder(data: number[], divisor: number[]): number[] {
  const result = new Array(divisor.length).fill(0);
  for (const b of data) {
    const factor = b ^ (result.shift() as number);
    result.push(0);
    divisor.forEach((d, i) => {
      result[i] ^= gfMul(d, factor);
    });
  }
  return result;
}

/* ---------- bit buffer ---------- */

class Bits {
  readonly bits: number[] = [];
  append(value: number, length: number) {
    for (let i = length - 1; i >= 0; i--) this.bits.push((value >>> i) & 1);
  }
}

/* ---------- matrix assembly ---------- */

const ALIGN_POSITIONS = (version: number): number[] => {
  if (version === 1) return [];
  const numAlign = Math.floor(version / 7) + 2;
  const size = version * 4 + 17;
  const step = version === 32 ? 26 : Math.ceil((size - 13) / (numAlign * 2 - 2)) * 2;
  const result = [6];
  for (let pos = size - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
  return result;
};

const MASKS: Array<(x: number, y: number) => boolean> = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

export interface QrMatrix {
  size: number;
  /** modules[y][x] — true means a dark module. */
  modules: boolean[][];
}

/**
 * Encodes `text` (UTF-8, byte mode) into a QR matrix, picking the smallest
 * version that fits. Throws only if the text exceeds version 40's capacity.
 */
export function encodeQr(text: string, ecc: Ecc = "M"): QrMatrix {
  const data = Array.from(new TextEncoder().encode(text));

  let version = 1;
  for (; version <= 40; version++) {
    const capacityBits = dataCodewords(version, ecc) * 8;
    const lengthBits = version <= 9 ? 8 : 16;
    if (4 + lengthBits + data.length * 8 <= capacityBits) break;
  }
  if (version > 40) throw new Error("Data too long for a QR code");

  const size = version * 4 + 17;
  const totalData = dataCodewords(version, ecc);

  /* --- bitstream: mode indicator, length, payload, terminator, padding --- */
  const bb = new Bits();
  bb.append(0x4, 4); // byte mode
  bb.append(data.length, version <= 9 ? 8 : 16);
  for (const b of data) bb.append(b, 8);
  bb.append(0, Math.min(4, totalData * 8 - bb.bits.length));
  bb.append(0, (8 - (bb.bits.length % 8)) % 8);
  for (let pad = 0xec; bb.bits.length < totalData * 8; pad ^= 0xec ^ 0x11) bb.append(pad, 8);

  const dataBytes: number[] = [];
  for (let i = 0; i < bb.bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bb.bits[i + j];
    dataBytes.push(byte);
  }

  /* --- interleave data + ECC blocks --- */
  const o = ECC_ORDINAL[ecc];
  const numBlocks = NUM_ECC_BLOCKS[o][version];
  const eccLen = ECC_CODEWORDS_PER_BLOCK[o][version];
  const shortBlockLen = Math.floor(totalData / numBlocks);
  const numShort = numBlocks - (totalData % numBlocks);
  const divisor = rsDivisor(eccLen);

  const blocks: number[][] = [];
  const eccBlocks: number[][] = [];
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const len = shortBlockLen + (i < numShort ? 0 : 1);
    const block = dataBytes.slice(k, k + len);
    k += len;
    blocks.push(block);
    eccBlocks.push(rsRemainder(block, divisor));
  }

  const codewords: number[] = [];
  for (let i = 0; i < shortBlockLen + 1; i++) {
    blocks.forEach((b) => {
      if (i < b.length) codewords.push(b[i]);
    });
  }
  for (let i = 0; i < eccLen; i++) eccBlocks.forEach((b) => codewords.push(b[i]));

  /* --- function patterns --- */
  const modules: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));
  const reserved: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));

  const setFn = (x: number, y: number, dark: boolean) => {
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    modules[y][x] = dark;
    reserved[y][x] = true;
  };

  const drawFinder = (cx: number, cy: number) => {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        setFn(cx + dx, cy + dy, d !== 2 && d !== 4);
      }
    }
  };

  // Timing patterns first; finders and alignment overwrite where they overlap.
  for (let i = 0; i < size; i++) {
    setFn(6, i, i % 2 === 0);
    setFn(i, 6, i % 2 === 0);
  }
  drawFinder(3, 3);
  drawFinder(size - 4, 3);
  drawFinder(3, size - 4);

  const aligns = ALIGN_POSITIONS(version);
  for (let i = 0; i < aligns.length; i++) {
    for (let j = 0; j < aligns.length; j++) {
      // The three finder corners already occupy these intersections.
      const corner =
        (i === 0 && j === 0) ||
        (i === 0 && j === aligns.length - 1) ||
        (i === aligns.length - 1 && j === 0);
      if (corner) continue;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          setFn(aligns[j] + dx, aligns[i] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    }
  }

  // Reserve exactly the cells drawFormatBits writes — no more. Over-reserving
  // even one module shifts the whole zigzag and corrupts the payload.
  for (let i = 0; i < 9; i++) {
    reserved[8][i] = true; // row 8, cols 0..8
    reserved[i][8] = true; // col 8, rows 0..8
  }
  for (let i = 0; i < 8; i++) {
    reserved[8][size - 1 - i] = true; // row 8, cols size-8..size-1
    reserved[size - 1 - i][8] = true; // col 8, rows size-8..size-1
  }
  setFn(8, size - 8, true); // always-dark module

  if (version >= 7) {
    let rem = version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bitsV = (version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const bit = ((bitsV >>> i) & 1) === 1;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setFn(a, b, bit);
      setFn(b, a, bit);
    }
  }

  /* --- lay codewords in the zigzag, skipping reserved cells --- */
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // the vertical timing column is never a data column
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (reserved[y][x]) continue;
        modules[y][x] =
          i < codewords.length * 8 && ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0;
        i++;
      }
    }
  }

  /* --- pick the mask with the lowest penalty --- */
  let bestMask = 0;
  let bestPenalty = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    applyMask(modules, reserved, mask, size);
    drawFormatBits(modules, ecc, mask, size);
    const penalty = penaltyScore(modules, size);
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      bestMask = mask;
    }
    applyMask(modules, reserved, mask, size); // XOR is its own inverse
  }
  applyMask(modules, reserved, bestMask, size);
  drawFormatBits(modules, ecc, bestMask, size);

  return { size, modules };
}

function applyMask(modules: boolean[][], reserved: boolean[][], mask: number, size: number) {
  const fn = MASKS[mask];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!reserved[y][x] && fn(x, y)) modules[y][x] = !modules[y][x];
    }
  }
}

function drawFormatBits(modules: boolean[][], ecc: Ecc, mask: number, size: number) {
  const data = (ECC_FORMAT_BITS[ecc] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const bits = ((data << 10) | rem) ^ 0x5412;

  // Written as modules[y][x]; the spec lists these positions as (x, y), so the
  // two indices are swapped relative to how the standard states them.
  const at = (i: number) => ((bits >>> i) & 1) === 1;
  for (let i = 0; i <= 5; i++) modules[i][8] = at(i); // x=8, y=i
  modules[7][8] = at(6);
  modules[8][8] = at(7);
  modules[8][7] = at(8);
  for (let i = 9; i < 15; i++) modules[8][14 - i] = at(i); // x=14-i, y=8

  for (let i = 0; i < 8; i++) modules[8][size - 1 - i] = at(i); // x=size-1-i, y=8
  for (let i = 8; i < 15; i++) modules[size - 15 + i][8] = at(i); // x=8, y=size-15+i
  modules[size - 8][8] = true;
}

/** ISO/IEC 18004 §8.8.2 penalty rules, used only to rank the eight masks. */
function penaltyScore(m: boolean[][], size: number): number {
  let score = 0;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // rule 1, run of 5+ in a row/column
      if (x + 4 < size) {
        const v = m[y][x];
        let run = 1;
        while (run < size - x && m[y][x + run] === v) run++;
        if (run >= 5 && (x === 0 || m[y][x - 1] !== v)) score += 3 + (run - 5);
      }
      if (y + 4 < size) {
        const v = m[y][x];
        let run = 1;
        while (run < size - y && m[y + run][x] === v) run++;
        if (run >= 5 && (y === 0 || m[y - 1][x] !== v)) score += 3 + (run - 5);
      }
      // rule 2, 2x2 blocks of one colour
      if (x + 1 < size && y + 1 < size) {
        const v = m[y][x];
        if (m[y][x + 1] === v && m[y + 1][x] === v && m[y + 1][x + 1] === v) score += 3;
      }
    }
  }

  // rule 3, finder-like 1:1:3:1:1 patterns with a 4-module light margin
  const pattern = [true, false, true, true, true, false, true];
  const matches = (get: (i: number) => boolean, start: number, len: number) => {
    for (let k = 0; k < 7; k++) if (get(start + k) !== pattern[k]) return false;
    let light = 0;
    for (let k = start - 1; k >= 0 && !get(k) && light < 4; k--) light++;
    if (light >= 4) return true;
    light = 0;
    for (let k = start + 7; k < len && !get(k) && light < 4; k++) light++;
    return light >= 4;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x + 7 <= size; x++) {
      if (matches((i) => m[y][i], x, size)) score += 40;
      if (matches((i) => m[i][y], x, size)) score += 40;
    }
  }

  // rule 4, deviation from a 50/50 dark ratio
  let dark = 0;
  for (const row of m) for (const cell of row) if (cell) dark++;
  const total = size * size;
  score += Math.floor(Math.abs(dark * 20 - total * 10) / total) * 10;

  return score;
}

/** Renders a matrix as an SVG path string, one unit per module. */
export function qrToPath(matrix: QrMatrix): string {
  const parts: string[] = [];
  for (let y = 0; y < matrix.size; y++) {
    for (let x = 0; x < matrix.size; x++) {
      if (matrix.modules[y][x]) parts.push("M" + x + " " + y + "h1v1h-1z");
    }
  }
  return parts.join("");
}
