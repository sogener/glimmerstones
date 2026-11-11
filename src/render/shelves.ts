import type { Layout, ShelfLayout } from './layout.ts';

/** Jewelry-box look: velvet trays with a golden lip. */

/** The page background is CSS (seamless with header/footer); the canvas stays transparent. */
export function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.clearRect(0, 0, w, h);
}

export function drawShelfBack(ctx: CanvasRenderingContext2D, L: ShelfLayout, cell: number, alpha = 1): void {
  const { x, y, w, h } = L.rect;
  const rad = cell * 0.24;
  ctx.save();
  ctx.globalAlpha = alpha;

  // Soft drop shadow.
  ctx.beginPath();
  ctx.roundRect(x + cell * 0.04, y + cell * 0.1, w, h, rad);
  ctx.fillStyle = 'rgba(5,2,12,0.45)';
  ctx.fill();

  // Velvet tray.
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, rad);
  const v = ctx.createLinearGradient(0, y, 0, y + h);
  v.addColorStop(0, '#1d1033');
  v.addColorStop(0.35, '#3a2160');
  v.addColorStop(1, '#4a2a74');
  ctx.fillStyle = v;
  ctx.fill();

  // Inner shadow along the top edge = depth.
  ctx.save();
  ctx.clip();
  const ins = ctx.createLinearGradient(0, y, 0, y + cell * 0.5);
  ins.addColorStop(0, 'rgba(8,3,18,0.65)');
  ins.addColorStop(1, 'rgba(8,3,18,0)');
  ctx.fillStyle = ins;
  ctx.fillRect(x, y, w, cell * 0.5);
  ctx.restore();

  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255,215,240,0.10)';
  ctx.stroke();

  // Sockets where stones rest.
  for (const cx of L.cellX) {
    const sy = L.lip.y + cell * 0.01;
    const s = ctx.createRadialGradient(cx, sy, 0, cx, sy, cell * 0.4);
    s.addColorStop(0, 'rgba(10,4,22,0.55)');
    s.addColorStop(1, 'rgba(10,4,22,0)');
    ctx.fillStyle = s;
    ctx.beginPath();
    ctx.ellipse(cx, sy, cell * 0.4, cell * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function drawShelfFront(ctx: CanvasRenderingContext2D, L: ShelfLayout, alpha = 1): void {
  const { x, y, w, h } = L.lip;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h * 0.5);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#fff1c9');
  g.addColorStop(0.25, '#e8c47e');
  g.addColorStop(0.7, '#b7863f');
  g.addColorStop(1, '#7a5426');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(x + h * 0.4, y + h * 0.14, w - h * 0.8, h * 0.18, h * 0.09);
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fill();
  ctx.restore();
}

/** Cached static layers: background + tray backs, and tray lips. */
export class ShelfLayers {
  back: HTMLCanvasElement = document.createElement('canvas');
  front: HTMLCanvasElement = document.createElement('canvas');
  private key = '';

  update(layout: Layout, w: number, h: number, dpr: number): void {
    const key = `${w}x${h}@${dpr}:${layout.shelves.length}:${layout.cell}`;
    if (key === this.key) return;
    this.key = key;
    for (const cv of [this.back, this.front]) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    }
    const b = this.back.getContext('2d')!;
    b.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawBackground(b, w, h);
    for (const L of layout.shelves) drawShelfBack(b, L, layout.cell);
    const f = this.front.getContext('2d')!;
    f.setTransform(dpr, 0, 0, dpr, 0, 0);
    f.clearRect(0, 0, w, h);
    for (const L of layout.shelves) drawShelfFront(f, L);
  }

  invalidate(): void {
    this.key = '';
  }
}
