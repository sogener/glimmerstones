import { ROW } from '../core/types.ts';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ShelfLayout {
  /** Whole shelf block incl. the peek area for hidden layers. */
  rect: Rect;
  /** Front-row cells, left to right. */
  cells: Rect[];
  /** Center y of the peeking hidden layer. */
  peekY: number;
  /** Plank under the front row. */
  plank: Rect;
}

export interface Layout {
  cell: number;
  gemR: number;
  shelves: ShelfLayout[];
}

const PAD = 0.16; // shelf side padding, in cells
const PEEK = 0.5; // peek area above the front row
const PLANK = 0.24;
const GAP_X = 0.45;
const GAP_Y = 0.38;
const COLS = 2;

/** Lays shelves out in two columns, centered, as big as fits (portrait first). */
export function computeLayout(count: number, width: number, height: number): Layout {
  const rows = Math.ceil(count / COLS);
  const shelfW = ROW + PAD * 2;
  const shelfH = PEEK + 1 + PLANK;
  const margin = 12;
  const byW = (width - margin * 2) / (COLS * shelfW + (COLS - 1) * GAP_X);
  const byH = (height - margin * 2) / (rows * shelfH + (rows - 1) * GAP_Y);
  const cell = Math.max(8, Math.min(byW, byH, 84));

  const totalH = (rows * shelfH + (rows - 1) * GAP_Y) * cell;
  const top = (height - totalH) / 2;
  const shelves: ShelfLayout[] = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / COLS);
    const inRow = Math.min(COLS, count - row * COLS);
    const col = i % COLS;
    const rowW = (inRow * shelfW + (inRow - 1) * GAP_X) * cell;
    const x = (width - rowW) / 2 + col * (shelfW + GAP_X) * cell;
    const y = top + row * (shelfH + GAP_Y) * cell;
    const frontY = y + PEEK * cell;
    const cells: Rect[] = [];
    for (let c = 0; c < ROW; c++) {
      cells.push({ x: x + (PAD + c) * cell, y: frontY, w: cell, h: cell });
    }
    shelves.push({
      rect: { x, y, w: shelfW * cell, h: shelfH * cell },
      cells,
      peekY: y + PEEK * cell * 0.62,
      plank: { x, y: frontY + cell * 0.9, w: shelfW * cell, h: PLANK * cell + cell * 0.1 },
    });
  }
  return { cell, gemR: cell * 0.4, shelves };
}

export function inRect(r: Rect, x: number, y: number, grow = 0): boolean {
  return x >= r.x - grow && x <= r.x + r.w + grow && y >= r.y - grow && y <= r.y + r.h + grow;
}
