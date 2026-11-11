import { decodeBoard } from './board.ts';
import type { Board } from './types.ts';

/** Pre-generated level as stored in src/data/levels.json. */
export interface PackedLevel {
  n: number;
  seed: number;
  /** Reward picture id; its palette gives the level colors. */
  picture: string;
  colors: number;
  /** Encoded shelves, see board.encodeShelf. */
  shelves: string[];
  /** Length of the solver's solution (rough difficulty). */
  solution: number;
  /** Casual-player win rate, lower is harder. */
  winRate: number;
}

export interface LevelPack {
  version: number;
  levels: PackedLevel[];
}

export function levelBoard(level: PackedLevel): Board {
  return decodeBoard(level.shelves);
}
