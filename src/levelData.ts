import pack from './data/levels.json';
import type { LevelPack, PackedLevel } from './core/levelpack.ts';

const levels = (pack as LevelPack).levels;

export const LEVEL_COUNT = levels.length;

export function getLevel(n: number): PackedLevel {
  return levels[Math.min(Math.max(n, 1), levels.length) - 1];
}
