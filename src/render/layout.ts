import { lerp } from '../anim/easing.ts';
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
  /** Center x of each front cell. */
  cellX: number[];
  /** Center y of front-row stones. */
  gemY: number;
  /** Center y of the peeking next hidden layer. */
  peekY: number;
  /** Front lip of the tray (drawn over the stones' bottoms). */
  lip: Rect;
}

export interface Layout {
  cell: number;
  gemR: number;
  peekR: number;
  shelves: ShelfLayout[];
}

const PAD = 0.14; // shelf side padding, in cells
const PEEK = 0.36; // area above the front row where the next layer peeks out
const BODY = 1.06; // front row + lip
const GAP_X = 0.42;
const GAP_Y = 0.36;
const MAX_CELL = 84;
const MARGIN = 12;
const SHELF_W = ROW + PAD * 2;
const SHELF_H = PEEK + BODY;

function cellFor(count: number, cols: number, width: number, height: number): number {
  const rows = Math.ceil(count / cols);
  const byW = (width - MARGIN * 2) / (cols * SHELF_W + (cols - 1) * GAP_X);
  const byH = (height - MARGIN * 2) / (rows * SHELF_H + (rows - 1) * GAP_Y);
  return Math.max(8, Math.min(byW, byH, MAX_CELL));
}

/**
 * Lays shelves out centered in 2 columns (portrait first), or in a single column
 * when that makes the stones clearly bigger (small levels).
 */
export function computeLayout(count: number, width: number, height: number): Layout {
  const one = cellFor(count, 1, width, height);
  const two = cellFor(count, 2, width, height);
  const COLS = one > two * 1.15 ? 1 : 2;
  const cell = COLS === 1 ? one : two;
  const rows = Math.ceil(count / COLS);
  const shelfW = SHELF_W;
  const shelfH = SHELF_H;

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
    shelves.push({
      rect: { x, y, w: shelfW * cell, h: shelfH * cell },
      cellX: Array.from({ length: ROW }, (_, c) => x + (PAD + c + 0.5) * cell),
      gemY: frontY + cell * 0.46,
      peekY: frontY - cell * 0.02,
      lip: { x, y: frontY + cell * 0.84, w: shelfW * cell, h: cell * 0.22 },
    });
  }
  return { cell, gemR: cell * 0.4, peekR: cell * 0.28, shelves };
}

export function inRect(r: Rect, x: number, y: number, grow = 0): boolean {
  return x >= r.x - grow && x <= r.x + r.w + grow && y >= r.y - grow && y <= r.y + r.h + grow;
}

function lerpRect(a: Rect, b: Rect, t: number): Rect {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), w: lerp(a.w, b.w, t), h: lerp(a.h, b.h, t) };
}

/** Interpolates two layouts; shelves missing in `a` stay at their `b` place. */
export function lerpLayout(a: Layout, b: Layout, t: number): Layout {
  return {
    cell: lerp(a.cell, b.cell, t),
    gemR: lerp(a.gemR, b.gemR, t),
    peekR: lerp(a.peekR, b.peekR, t),
    shelves: b.shelves.map((sb, i) => {
      const sa = a.shelves[i];
      if (!sa) return sb;
      return {
        rect: lerpRect(sa.rect, sb.rect, t),
        cellX: sb.cellX.map((x, c) => lerp(sa.cellX[c], x, t)),
        gemY: lerp(sa.gemY, sb.gemY, t),
        peekY: lerp(sa.peekY, sb.peekY, t),
        lip: lerpRect(sa.lip, sb.lip, t),
      };
    }),
  };
}
