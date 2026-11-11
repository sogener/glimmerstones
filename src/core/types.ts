/** Gem kind 0..7. Each kind has its own cut shape (see render/gems). */
export type Color = number;
export type Cell = Color | null;

export const ROW = 3;
export const MAX_COLORS = 8;
export const MIN_SHELVES = 5;
export const MAX_SHELVES = 12;

export interface Shelf {
  /** Front row, always ROW cells. Only these stones can be moved. */
  readonly front: readonly Cell[];
  /** Hidden layers, layers[0] comes forward next. Each has 1..ROW stones. */
  readonly layers: readonly (readonly Color[])[];
}

export interface Board {
  readonly shelves: readonly Shelf[];
}

export interface CellRef {
  shelf: number;
  cell: number;
}
