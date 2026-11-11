import { fitParams, type LevelParams } from './generator.ts';
import { hashSeed, mulberry32, randInt } from './rng.ts';

/** Hand-tuned gentle start: few colors, no hidden layers. */
const INTRO: LevelParams[] = [
  { colors: 3, triples: [1, 1, 1], shelves: 5, depth: 0, emptyCells: 6 },
  { colors: 3, triples: [2, 2, 2], shelves: 7, depth: 0, emptyCells: 3 },
  { colors: 4, triples: [2, 2, 2, 2], shelves: 9, depth: 0, emptyCells: 3 },
  { colors: 4, triples: [2, 2, 2, 2], shelves: 6, depth: 1, emptyCells: 3 },
];

/** Every BREATHER-th level is noticeably easier. */
export const BREATHER = 5;

export function isBreather(n: number): boolean {
  return n > INTRO.length && n % BREATHER === 0;
}

/**
 * Difficulty curve. `d` grows with the level, breathers step back,
 * and after level ~60 difficulty wanders in a comfortable band instead of growing forever.
 */
function effectiveDifficulty(n: number): number {
  const rng = mulberry32(hashSeed('difficulty', n));
  let d = n <= 60 ? n : 36 + randInt(rng, 0, 24);
  if (isBreather(n)) d = Math.max(5, Math.round(d * 0.55));
  return d;
}

/** Target share of wins for a casual player (see difficulty.ts). */
export function targetWinRate(n: number): number {
  if (n <= INTRO.length) return 1;
  return Math.max(0.3, 0.97 - effectiveDifficulty(n) * 0.012);
}

export function paramsForLevel(n: number): LevelParams {
  if (n >= 1 && n <= INTRO.length) return fitParams(INTRO[n - 1]);
  const rng = mulberry32(hashSeed('params', n));
  const d = effectiveDifficulty(n);

  const colors = Math.min(8, 4 + Math.floor((d - 5) / 7));
  const baseTriples = d < 14 ? 2 : d < 30 ? 2 + (rng() < 0.4 ? 1 : 0) : 3;
  const triples = Array.from({ length: colors }, () =>
    Math.min(4, baseTriples + (d >= 20 && rng() < 0.25 ? 1 : 0)),
  );
  const depth = d < 10 ? 1 : d < 24 ? 2 : 3;
  const emptyCells = d < 30 ? 3 : rng() < 0.3 ? 2 : 3;

  const stones = triples.reduce((a, b) => a + b, 0) * 3;
  const shelves = Math.round(stones / (3 * (1 + depth * 0.75))) + 1 + randInt(rng, 0, 1);

  return fitParams({ colors, triples, shelves, depth, emptyCells });
}
