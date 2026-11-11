import type { Board, CellRef } from '../core/types.ts';
import { inRect, type Layout } from '../render/layout.ts';

/** Front-row stone under the point, if any (the hit box includes the lifted position). */
export function hitStone(board: Board, layout: Layout, x: number, y: number): CellRef | null {
  const c = layout.cell;
  for (let i = 0; i < layout.shelves.length; i++) {
    const L = layout.shelves[i];
    for (let j = 0; j < L.cellX.length; j++) {
      const dx = Math.abs(x - L.cellX[j]);
      const dy = y - L.gemY;
      if (dx <= c * 0.5 && dy >= -c * 0.62 && dy <= c * 0.56 && board.shelves[i]?.front[j] != null) {
        return { shelf: i, cell: j };
      }
    }
  }
  return null;
}

/** Shelf under the point; with `reach`, also the nearest shelf within that distance. */
export function hitShelf(layout: Layout, x: number, y: number, reach = 0): number {
  const grow = layout.cell * 0.18;
  let best = -1;
  let bestD = Infinity;
  layout.shelves.forEach((L, i) => {
    if (inRect(L.rect, x, y, grow)) {
      best = i;
      bestD = -1;
    }
    if (bestD < 0) return;
    const cx = Math.max(L.rect.x, Math.min(x, L.rect.x + L.rect.w));
    const cy = Math.max(L.rect.y, Math.min(y, L.rect.y + L.rect.h));
    const d = Math.hypot(x - cx, y - cy);
    if (d <= reach && d < bestD) {
      best = i;
      bestD = d;
    }
  });
  return best;
}

/** Free cell of the shelf closest to x, or null if the shelf is full. */
export function nearestFreeCell(board: Board, layout: Layout, shelf: number, x: number): CellRef | null {
  const s = board.shelves[shelf];
  const L = layout.shelves[shelf];
  if (!s || !L) return null;
  let best = -1;
  let bestD = Infinity;
  s.front.forEach((c, j) => {
    const d = Math.abs(L.cellX[j] - x);
    if (c === null && d < bestD) {
      best = j;
      bestD = d;
    }
  });
  return best >= 0 ? { shelf, cell: best } : null;
}
