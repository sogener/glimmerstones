import type { Board, CellRef } from '../core/types.ts';
import { drawGem, shapePath, gemStyle } from './gems.ts';
import type { Layout } from './layout.ts';

export interface SceneState {
  board: Board;
  layout: Layout;
  selected: CellRef | null;
  time: number;
}

export function drawScene(ctx: CanvasRenderingContext2D, w: number, h: number, s: SceneState): void {
  ctx.clearRect(0, 0, w, h);
  const { layout, board } = s;
  const r = layout.gemR;

  board.shelves.forEach((shelf, i) => {
    const L = layout.shelves[i];
    if (!L) return;

    // Tray behind the stones.
    ctx.beginPath();
    ctx.roundRect(L.rect.x, L.rect.y, L.rect.w, L.rect.h, layout.cell * 0.22);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fill();

    // Next hidden layer peeks from behind, dimmed and smaller.
    const next = shelf.layers[0];
    if (next) {
      next.forEach((c, j) => {
        const cell = L.cells[j];
        const x = cell.x + cell.w / 2;
        drawGem(ctx, c, x, L.peekY, r * 0.62);
        ctx.save();
        ctx.translate(x, L.peekY);
        ctx.beginPath();
        shapePath(ctx, gemStyle(c).shape, r * 0.62 + 1);
        ctx.fillStyle = 'rgba(18,10,36,0.55)';
        ctx.fill();
        ctx.restore();
      });
      if (shelf.layers.length > 1) {
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.font = `600 ${Math.round(layout.cell * 0.24)}px system-ui, sans-serif`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillText(`+${shelf.layers.length - 1}`, L.rect.x + L.rect.w - layout.cell * 0.1, L.rect.y + 2);
      }
    }

    // Plank.
    const p = L.plank;
    const g = ctx.createLinearGradient(0, p.y, 0, p.y + p.h);
    g.addColorStop(0, '#8a6bc4');
    g.addColorStop(1, '#4b3478');
    ctx.beginPath();
    ctx.roundRect(p.x, p.y, p.w, p.h, p.h * 0.45);
    ctx.fillStyle = g;
    ctx.fill();

    // Empty cell hints.
    shelf.front.forEach((c, j) => {
      const cell = L.cells[j];
      if (c !== null) return;
      ctx.beginPath();
      ctx.ellipse(cell.x + cell.w / 2, p.y + p.h * 0.2, r * 0.6, r * 0.14, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(20,10,40,0.35)';
      ctx.fill();
    });

    // Front row.
    shelf.front.forEach((c, j) => {
      if (c === null) return;
      const cell = L.cells[j];
      const sel = s.selected && s.selected.shelf === i && s.selected.cell === j;
      const lift = sel ? layout.cell * (0.18 + 0.03 * Math.sin(s.time / 180)) : 0;
      const x = cell.x + cell.w / 2;
      const y = cell.y + cell.h * 0.48 - lift;
      if (sel) {
        ctx.save();
        ctx.shadowColor = 'rgba(255,240,255,0.95)';
        ctx.shadowBlur = layout.cell * 0.45;
        drawGem(ctx, c, x, y, r);
        ctx.restore();
      }
      drawGem(ctx, c, x, y, r);
    });
  });
}
