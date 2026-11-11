import pack from './data/levels.json';
import type { LevelPack, PackedLevel } from './core/levelpack.ts';

const levels = (pack as LevelPack).levels;

/** Number of hand-checked generated levels; after them play continues endlessly. */
export const LEVEL_COUNT = levels.length;
/** Past the end, levels from here on repeat (the calm, varied part of the curve). */
const LOOP_FROM = Math.min(61, LEVEL_COUNT);

/** Level n (1-based, unbounded) → stored level. */
export function getLevel(n: number): PackedLevel {
  const k = Math.max(1, Math.floor(n));
  if (k <= LEVEL_COUNT) return levels[k - 1];
  const span = LEVEL_COUNT - LOOP_FROM + 1;
  return levels[LOOP_FROM - 1 + ((k - LEVEL_COUNT - 1) % span)];
}
