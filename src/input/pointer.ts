import { firstFreeCell } from '../core/board.ts';
import type { Board, CellRef } from '../core/types.ts';
import { inRect, type Layout } from '../render/layout.ts';

/** Front-row stone under the point, if any. */
export function hitStone(board: Board, layout: Layout, x: number, y: number): CellRef | null {
  for (let i = 0; i < layout.shelves.length; i++) {
    const L = layout.shelves[i];
    for (let c = 0; c < L.cells.length; c++) {
      const r = L.cells[c];
      const hit = inRect({ x: r.x, y: r.y - layout.cell * 0.2, w: r.w, h: r.h + layout.cell * 0.3 }, x, y);
      if (hit && board.shelves[i]?.front[c] !== null) return { shelf: i, cell: c };
    }
  }
  return null;
}

/** Target cell when a stone is dropped/tapped at the point: tapped free cell, else leftmost free. */
export function hitTarget(board: Board, layout: Layout, x: number, y: number): CellRef | null {
  const grow = layout.cell * 0.18;
  for (let i = 0; i < layout.shelves.length; i++) {
    const L = layout.shelves[i];
    if (!inRect(L.rect, x, y, grow)) continue;
    const shelf = board.shelves[i];
    if (!shelf) return null;
    const tapped = L.cells.findIndex((r) => x >= r.x && x <= r.x + r.w);
    if (tapped >= 0 && shelf.front[tapped] === null) return { shelf: i, cell: tapped };
    const free = firstFreeCell(shelf);
    return free >= 0 ? { shelf: i, cell: free } : null;
  }
  return null;
}
