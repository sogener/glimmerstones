import { makeShelf, settleBoard } from './board.ts';
import { hashSeed, mulberry32, shuffle, type Rng } from './rng.ts';
import { casualWinRate } from './difficulty.ts';
import { solve } from './solver.ts';
import { MAX_COLORS, MAX_SHELVES, MIN_SHELVES, ROW, type Board, type Cell, type Color } from './types.ts';

export interface LevelParams {
  /** Number of colors (gem kinds), 1..8. */
  colors: number;
  /** Triples per color, length === colors. */
  triples: number[];
  /** Number of shelves, 5..12. */
  shelves: number;
  /** Max hidden layers behind a shelf's front row. */
  depth: number;
  /** Free front cells at start (at least this many). */
  emptyCells: number;
}

export function totalStones(p: LevelParams): number {
  return p.triples.reduce((a, b) => a + b, 0) * ROW;
}

function hiddenLayersNeeded(p: LevelParams): number {
  const front = Math.min(totalStones(p), p.shelves * ROW - p.emptyCells);
  return Math.ceil((totalStones(p) - front) / ROW);
}

/** Grows shelves (then depth) until all stones fit. */
export function fitParams(p: LevelParams): LevelParams {
  const q = { ...p, triples: [...p.triples] };
  q.colors = Math.min(MAX_COLORS, Math.max(1, q.colors));
  q.shelves = Math.min(MAX_SHELVES, Math.max(MIN_SHELVES, q.shelves));
  while (hiddenLayersNeeded(q) > q.shelves * q.depth) {
    if (q.shelves < MAX_SHELVES) q.shelves++;
    else q.depth++;
  }
  return q;
}

/** Random board for the params. Not checked for solvability. */
export function generateBoard(params: LevelParams, rng: Rng): Board {
  const p = fitParams(params);
  const bag: Color[] = [];
  p.triples.forEach((t, c) => {
    for (let i = 0; i < t * ROW; i++) bag.push(c);
  });
  shuffle(rng, bag);

  const cells = p.shelves * ROW;
  const frontStones = Math.min(bag.length, cells - p.emptyCells);
  const hidden = bag.length - frontStones;
  const layerTotal = Math.ceil(hidden / ROW);

  // How many hidden layers each shelf gets.
  const layerCounts = new Array<number>(p.shelves).fill(0);
  for (let k = 0; k < layerTotal; k++) {
    const open = layerCounts.map((n, i) => (n < p.depth ? i : -1)).filter((i) => i >= 0);
    const min = Math.min(...open.map((i) => layerCounts[i]));
    // Prefer shallow shelves so depth spreads evenly, with some randomness.
    const pool = rng() < 0.6 ? open.filter((i) => layerCounts[i] === min) : open;
    layerCounts[pool[Math.floor(rng() * pool.length)]]++;
  }
  // Sizes of hidden layers: full, except some trimmed to hit the exact count.
  const sizes = new Array<number>(layerTotal).fill(ROW);
  let excess = layerTotal * ROW - hidden;
  while (excess > 0) {
    const i = Math.floor(rng() * layerTotal);
    if (sizes[i] > 1) {
      sizes[i]--;
      excess--;
    }
  }

  // Which front cells are empty.
  const slots = shuffle(
    rng,
    Array.from({ length: cells }, (_, i) => i),
  );
  const emptySlots = new Set(slots.slice(0, cells - frontStones));

  let cursor = 0;
  const fronts: Cell[][] = [];
  for (let s = 0; s < p.shelves; s++) {
    const row: Cell[] = [];
    for (let c = 0; c < ROW; c++) row.push(emptySlots.has(s * ROW + c) ? null : bag[cursor++]);
    fronts.push(row);
  }
  const layers: Color[][][] = [];
  let sizeIdx = 0;
  for (let s = 0; s < p.shelves; s++) {
    const stack: Color[][] = [];
    for (let k = 0; k < layerCounts[s]; k++) {
      stack.push(bag.slice(cursor, cursor + sizes[sizeIdx]));
      cursor += sizes[sizeIdx++];
    }
    layers.push(stack);
  }

  breakReadyTriples(fronts, layers, rng);
  return settleBoard({ shelves: fronts.map((f, i) => makeShelf(f, layers[i])) });
}

/** Swaps stones so that no front row or hidden layer starts as a complete triple. */
function breakReadyTriples(fronts: Cell[][], layers: Color[][][], rng: Rng): void {
  const groups: Cell[][] = [...fronts, ...layers.flat()];
  const mono = (g: Cell[]) => g.length === ROW && g[0] !== null && g.every((x) => x === g[0]);
  for (let guard = 0; guard < 1000; guard++) {
    const bad = groups.find(mono);
    if (!bad) return;
    const other = groups[Math.floor(rng() * groups.length)];
    const j = Math.floor(rng() * other.length);
    if (other === bad || other[j] === null || other[j] === bad[0]) continue;
    const i = Math.floor(rng() * ROW);
    [bad[i], other[j]] = [other[j], bad[i]];
  }
}

export interface GeneratedLevel {
  n: number;
  seed: number;
  attempt: number;
  params: LevelParams;
  board: Board;
  solution: number;
  nodes: number;
  /** casualWinRate of the chosen board. */
  winRate: number;
}

export interface GenerateOptions {
  maxNodes?: number;
  maxAttempts?: number;
  /** Desired casualWinRate; the closest of `candidates` solvable boards wins. */
  targetWinRate?: number;
  candidates?: number;
}

/**
 * Deterministic: tries seeds hash(n, attempt); keeps boards the solver proves solvable
 * and picks the one whose difficulty is closest to the target.
 * Every 10 failed attempts the level gets one more free cell.
 */
export function generateSolvable(n: number, base: LevelParams, opts: GenerateOptions = {}): GeneratedLevel {
  const maxAttempts = opts.maxAttempts ?? 200;
  const wanted = opts.targetWinRate === undefined ? 1 : (opts.candidates ?? 6);
  let best: GeneratedLevel | null = null;
  let found = 0;
  let failures = 0;
  for (let attempt = 0; attempt < maxAttempts && found < wanted; attempt++) {
    const params = fitParams({ ...base, emptyCells: base.emptyCells + Math.floor(failures / 10) });
    const seed = hashSeed('level', n, attempt);
    const board = generateBoard(params, mulberry32(seed));
    const res = solve(board, { maxNodes: opts.maxNodes });
    if (res.status !== 'solved') {
      failures++;
      continue;
    }
    found++;
    const winRate = opts.targetWinRate === undefined ? 1 : casualWinRate(board, 80, seed);
    const level = { n, seed, attempt, params, board, solution: res.moves.length, nodes: res.nodes, winRate };
    const dist = (l: GeneratedLevel) => Math.abs(l.winRate - (opts.targetWinRate ?? 1));
    if (!best || dist(level) < dist(best)) best = level;
  }
  if (!best) throw new Error(`Level ${n}: no solvable board in ${maxAttempts} attempts`);
  return best;
}
