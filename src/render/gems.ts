import type { Color } from '../core/types.ts';

export type GemShape = 'circle' | 'square' | 'heart' | 'drop' | 'star' | 'hexagon' | 'oval' | 'triangle';

export interface GemStyle {
  shape: GemShape;
  /** Base color. With pictures (stage 3) this comes from the picture palette. */
  color: string;
}

/** Default palette: color and cut are tied together so similar hues never get confused. */
export const GEM_STYLES: readonly GemStyle[] = [
  { shape: 'circle', color: '#ff3b5c' },
  { shape: 'square', color: '#3a7bff' },
  { shape: 'heart', color: '#ff6ec7' },
  { shape: 'drop', color: '#2fd4e0' },
  { shape: 'star', color: '#ffc928' },
  { shape: 'hexagon', color: '#2ed47a' },
  { shape: 'oval', color: '#a466ff' },
  { shape: 'triangle', color: '#ff8c2e' },
];

export function gemStyle(c: Color): GemStyle {
  return GEM_STYLES[c % GEM_STYLES.length];
}

function polygon(ctx: CanvasRenderingContext2D, pts: [number, number][]): void {
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

/** Adds the outline of a gem of radius r centered at (0, 0) to the current path. */
export function shapePath(ctx: CanvasRenderingContext2D, shape: GemShape, r: number): void {
  switch (shape) {
    case 'circle':
      ctx.arc(0, 0, r * 0.92, 0, Math.PI * 2);
      break;
    case 'square': {
      const s = r * 0.8;
      ctx.roundRect(-s, -s, s * 2, s * 2, r * 0.22);
      break;
    }
    case 'heart': {
      const k = r * 1.02;
      ctx.moveTo(0, k * 0.86);
      ctx.bezierCurveTo(-k * 1.25, k * 0.05, -k * 0.75, -k * 0.95, 0, -k * 0.42);
      ctx.bezierCurveTo(k * 0.75, -k * 0.95, k * 1.25, k * 0.05, 0, k * 0.86);
      ctx.closePath();
      break;
    }
    case 'drop': {
      const k = r;
      ctx.moveTo(0, -k * 0.98);
      ctx.bezierCurveTo(k * 0.35, -k * 0.5, k * 0.82, -k * 0.05, k * 0.78, k * 0.3);
      ctx.arc(0, k * 0.3, k * 0.78, 0, Math.PI, false);
      ctx.bezierCurveTo(-k * 0.82, -k * 0.05, -k * 0.35, -k * 0.5, 0, -k * 0.98);
      ctx.closePath();
      break;
    }
    case 'star': {
      const pts: [number, number][] = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 === 0 ? r * 1.0 : r * 0.5;
        pts.push([Math.cos(a) * rr, Math.sin(a) * rr + r * 0.06]);
      }
      polygon(ctx, pts);
      break;
    }
    case 'hexagon': {
      const pts: [number, number][] = [];
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 6 + (i * Math.PI) / 3;
        pts.push([Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95]);
      }
      polygon(ctx, pts);
      break;
    }
    case 'oval':
      ctx.ellipse(0, 0, r * 0.68, r * 0.96, 0, 0, Math.PI * 2);
      break;
    case 'triangle': {
      const k = r * 1.05;
      polygon(ctx, [
        [0, -k * 0.9],
        [k * 0.95, k * 0.72],
        [-k * 0.95, k * 0.72],
      ]);
      break;
    }
  }
}

/** Simple stage-1 gem: shaded body + highlight. Stage 2 replaces it with cut facets. */
export function drawGem(ctx: CanvasRenderingContext2D, c: Color, x: number, y: number, r: number): void {
  const st = gemStyle(c);
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  shapePath(ctx, st.shape, r);
  const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r * 1.1);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.25, st.color);
  g.addColorStop(1, shade(st.color, -0.45));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = Math.max(1, r * 0.06);
  ctx.strokeStyle = shade(st.color, -0.55);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(-r * 0.28, -r * 0.38, r * 0.22, r * 0.12, -0.6, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fill();
  ctx.restore();
}

/** Lightens (amount > 0) or darkens (amount < 0) a #rrggbb color. */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) =>
    Math.round(amount >= 0 ? v + (255 - v) * amount : v * (1 + amount)),
  );
  return '#' + ch.map((v) => v.toString(16).padStart(2, '0')).join('');
}
