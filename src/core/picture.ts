import { MAX_COLORS } from './types.ts';

/**
 * Reward picture, stored as JSON in src/pictures/*.json:
 * { id, name, width, height, palette: { "<char>": "#rrggbb", ... }, rows: ["..ab..", ...] }
 * "." is an empty cell. Palette order = order of keys = level color index (and gem cut).
 */
export interface PictureData {
  id: string;
  name: string;
  width: number;
  height: number;
  palette: Record<string, string>;
  rows: string[];
}

export interface Piece {
  /** Palette (= level color) index. */
  color: number;
  /** Cell indices (y * width + x), in fill order: bottom first. */
  cells: number[];
  /** Centroid in cell units. */
  cx: number;
  cy: number;
}

export const EMPTY = '.';
const MIN_SIZE = 8;
const MAX_SIZE = 32;

export function paletteKeys(p: PictureData): string[] {
  return Object.keys(p.palette);
}

export function validatePicture(p: PictureData): string[] {
  const errors: string[] = [];
  const keys = paletteKeys(p);
  if (!p.id || !/^[a-z0-9-]+$/.test(p.id)) errors.push('id must be lowercase latin, digits, "-"');
  if (!p.name) errors.push('name is required');
  if (p.width < MIN_SIZE || p.width > MAX_SIZE || p.height < MIN_SIZE || p.height > MAX_SIZE)
    errors.push(`size must be ${MIN_SIZE}..${MAX_SIZE}`);
  if (keys.length < 1 || keys.length > MAX_COLORS) errors.push(`palette must have 1..${MAX_COLORS} colors`);
  for (const k of keys) {
    if (k.length !== 1 || k === EMPTY || /[0-9]/.test(k)) errors.push(`bad palette key "${k}"`);
    if (!/^#[0-9a-fA-F]{6}$/.test(p.palette[k])) errors.push(`bad color for "${k}"`);
  }
  if (p.rows.length !== p.height) errors.push('rows.length !== height');
  p.rows.forEach((r, y) => {
    if (r.length !== p.width) errors.push(`row ${y} has length ${r.length}`);
    for (const ch of r) if (ch !== EMPTY && !(ch in p.palette)) errors.push(`row ${y}: unknown "${ch}"`);
  });
  const counts = cellCounts(p);
  keys.forEach((k, i) => counts[i] === 0 && errors.push(`color "${k}" is unused`));
  return errors;
}

/** Color index of every cell, -1 for empty. */
export function cellColors(p: PictureData): number[] {
  const keys = paletteKeys(p);
  const out: number[] = [];
  for (const r of p.rows) for (const ch of r) out.push(ch === EMPTY ? -1 : keys.indexOf(ch));
  return out;
}

export function cellCounts(p: PictureData): number[] {
  const counts = new Array<number>(paletteKeys(p).length).fill(0);
  for (const c of cellColors(p)) if (c >= 0) counts[c]++;
  return counts;
}

function neighbors(i: number, w: number, h: number): number[] {
  const x = i % w;
  const y = (i - x) / w;
  const out: number[] = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < w && ny < h) out.push(ny * w + nx);
    }
  return out;
}

/** 8-connected components of each color (pixel-art diagonals count as connected). */
export function components(p: PictureData): number[][][] {
  const colors = cellColors(p);
  const seen = new Uint8Array(colors.length);
  const result: number[][][] = paletteKeys(p).map(() => []);
  for (let i = 0; i < colors.length; i++) {
    if (colors[i] < 0 || seen[i]) continue;
    const comp: number[] = [];
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const a = stack.pop()!;
      comp.push(a);
      for (const b of neighbors(a, p.width, p.height)) {
        if (!seen[b] && colors[b] === colors[i]) {
          seen[b] = 1;
          stack.push(b);
        }
      }
    }
    result[colors[i]].push(comp.sort((a, b) => a - b));
  }
  return result;
}

/** Splits `items` units proportionally to `weights` (largest remainder), respecting min/max. */
function apportion(total: number, weights: number[], min: number[], max: number[]): number[] {
  const out = [...min];
  let left = total - out.reduce((a, b) => a + b, 0);
  while (left > 0) {
    let best = -1;
    let bestScore = -Infinity;
    for (let i = 0; i < weights.length; i++) {
      if (out[i] >= max[i]) continue;
      const score = weights[i] / (out[i] + 1);
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    if (best < 0) break;
    out[best]++;
    left--;
  }
  return out;
}

/** Most triples a single color may get (keeps pieces from becoming crumbs). */
export const MAX_TRIPLES_PER_COLOR = 8;

/**
 * How many triples (= pieces) each color gets for about `total` triples:
 * at least one per connected component, the rest proportional to area.
 */
export function distributeTriples(p: PictureData, total: number): number[] {
  const comps = components(p);
  const counts = cellCounts(p);
  const min = comps.map((c) => c.length);
  const max = counts.map((n, i) => Math.max(min[i], Math.min(n, MAX_TRIPLES_PER_COLOR)));
  return apportion(Math.max(total, min.reduce((a, b) => a + b, 0)), counts, min, max);
}

function bfsDistances(start: number, inside: Set<number>, w: number, h: number): Map<number, number> {
  const dist = new Map<number, number>([[start, 0]]);
  const queue = [start];
  for (let q = 0; q < queue.length; q++) {
    const a = queue[q];
    for (const b of neighbors(a, w, h)) {
      if (inside.has(b) && !dist.has(b)) {
        dist.set(b, dist.get(a)! + 1);
        queue.push(b);
      }
    }
  }
  return dist;
}

/** Splits one connected component into `n` connected, roughly equal pieces. */
function splitComponent(comp: number[], n: number, w: number, h: number): number[][] {
  if (n <= 1) return [comp];
  const inside = new Set(comp);
  // Seeds: bottom-most cell, then farthest-point sampling.
  const yOf = (i: number) => Math.floor(i / w);
  let first = comp[0];
  for (const c of comp) if (yOf(c) > yOf(first) || (yOf(c) === yOf(first) && c < first)) first = c;
  const seeds = [first];
  const minDist = bfsDistances(first, inside, w, h);
  while (seeds.length < n) {
    let far = -1;
    let farD = -1;
    for (const c of comp) {
      const d = minDist.get(c) ?? 0;
      if (d > farD) {
        farD = d;
        far = c;
      }
    }
    seeds.push(far);
    for (const [c, d] of bfsDistances(far, inside, w, h)) if (d < (minDist.get(c) ?? Infinity)) minDist.set(c, d);
  }
  // Balanced growth: the smallest region with room takes its next frontier cell.
  const owner = new Map<number, number>();
  const regions: number[][] = seeds.map((s, r) => {
    owner.set(s, r);
    return [s];
  });
  const frontier: number[][] = seeds.map((s) => neighbors(s, w, h).filter((b) => inside.has(b)));
  let assigned = seeds.length;
  while (assigned < comp.length) {
    let pickR = -1;
    for (let r = 0; r < regions.length; r++) {
      while (frontier[r].length && owner.has(frontier[r][0])) frontier[r].shift();
      if (frontier[r].length && (pickR < 0 || regions[r].length < regions[pickR].length)) pickR = r;
    }
    if (pickR < 0) break;
    const cell = frontier[pickR].shift()!;
    owner.set(cell, pickR);
    regions[pickR].push(cell);
    assigned++;
    for (const b of neighbors(cell, w, h)) if (inside.has(b) && !owner.has(b)) frontier[pickR].push(b);
  }
  return regions;
}

/**
 * Cuts each color into `triples[color]` connected pieces.
 * Returns pieces per color, ordered bottom first (they fill up like a jar).
 */
export function partition(p: PictureData, triples: readonly number[]): Piece[][] {
  const w = p.width;
  return components(p).map((comps, color) => {
    const want = triples[color] ?? comps.length;
    const sizes = comps.map((c) => c.length);
    const perComp = apportion(Math.max(want, comps.length), sizes, sizes.map(() => 1), sizes);
    const pieces: Piece[] = [];
    comps.forEach((comp, k) => {
      for (const cells of splitComponent(comp, perComp[k], w, p.height)) {
        const xs = cells.map((i) => i % w);
        const ys = cells.map((i) => Math.floor(i / w));
        const sorted = [...cells].sort((a, b) => Math.floor(b / w) - Math.floor(a / w) || (a % w) - (b % w));
        pieces.push({
          color,
          cells: sorted,
          cx: xs.reduce((a, b) => a + b, 0) / cells.length + 0.5,
          cy: ys.reduce((a, b) => a + b, 0) / cells.length + 0.5,
        });
      }
    });
    return pieces.sort((a, b) => b.cy - a.cy || a.cx - b.cx);
  });
}
