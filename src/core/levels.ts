import { fitParams, type LevelParams } from './generator.ts';
import { distributeTriples, paletteKeys, type PictureData } from './picture.ts';
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

function shelvesFor(stones: number, depth: number, extra: number): number {
  return Math.round(stones / (3 * (1 + depth * 0.75))) + 1 + extra;
}

/**
 * Level parameters. Without a picture colors get equal triples (used in tests);
 * with a picture, colors = its palette and triples follow the picture's areas.
 */
export function paramsForLevel(n: number, picture?: PictureData): LevelParams {
  if (n >= 1 && n <= INTRO.length) {
    const base = INTRO[n - 1];
    if (!picture) return fitParams(base);
    const total = base.triples.reduce((a, b) => a + b, 0);
    const triples = distributeTriples(picture, total);
    return fitParams({ ...base, colors: triples.length, triples });
  }
  const rng = mulberry32(hashSeed('params', n));
  const d = effectiveDifficulty(n);

  const colors = desiredColors(n);
  const baseTriples = d < 14 ? 2 : d < 30 ? 2 + (rng() < 0.4 ? 1 : 0) : 3;
  let triples = Array.from({ length: colors }, () =>
    Math.min(4, baseTriples + (d >= 20 && rng() < 0.25 ? 1 : 0)),
  );
  if (picture) triples = distributeTriples(picture, triples.reduce((a, b) => a + b, 0));
  const depth = d < 10 ? 1 : d < 24 ? 2 : 3;
  const emptyCells = d < 30 ? 3 : rng() < 0.3 ? 2 : 3;

  const stones = triples.reduce((a, b) => a + b, 0) * 3;
  const shelves = shelvesFor(stones, depth, randInt(rng, 0, 1));
  return fitParams({ colors: triples.length, triples, shelves, depth, emptyCells });
}

/** How many colors the difficulty curve wants for level n. */
export function desiredColors(n: number): number {
  if (n >= 1 && n <= INTRO.length) return INTRO[n - 1].colors;
  return Math.min(8, 4 + Math.floor((effectiveDifficulty(n) - 5) / 7));
}

/**
 * Picks a picture for every level: palette size close to the wanted color count
 * (wanted-2..wanted), least recently used first, so pictures rotate.
 */
export function assignPictures(count: number, pictures: readonly PictureData[]): string[] {
  const size = (p: PictureData) => paletteKeys(p).length;
  const last = new Map<string, number>();
  const ids: string[] = [];
  for (let n = 1; n <= count; n++) {
    const want = desiredColors(n);
    let cands = pictures.filter((p) => size(p) <= want && size(p) >= want - 2);
    if (cands.length === 0) cands = pictures.filter((p) => size(p) <= want);
    if (cands.length === 0) cands = [...pictures];
    const best = [...cands].sort(
      (a, b) =>
        (last.get(a.id) ?? -1) - (last.get(b.id) ?? -1) || size(b) - size(a) || (a.id < b.id ? -1 : 1),
    )[0];
    last.set(best.id, n);
    ids.push(best.id);
  }
  return ids;
}
