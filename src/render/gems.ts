import type { Color } from '../core/types.ts';

export type GemShape = 'circle' | 'square' | 'heart' | 'drop' | 'star' | 'hexagon' | 'oval' | 'triangle';

export interface GemStyle {
  shape: GemShape;
  /** Base color. With pictures (stage 3) this comes from the picture palette. */
  color: string;
}

/** Default palette: color and cut are tied together so similar hues never get confused. */
export const GEM_STYLES: readonly GemStyle[] = [
  { shape: 'circle', color: '#ff3d63' },
  { shape: 'square', color: '#3d7dff' },
  { shape: 'heart', color: '#ff70c8' },
  { shape: 'drop', color: '#25d0e0' },
  { shape: 'star', color: '#ffc21f' },
  { shape: 'hexagon', color: '#27cf74' },
  { shape: 'oval', color: '#a36bff' },
  { shape: 'triangle', color: '#ff8a2a' },
];

type Pt = [number, number];

interface Outline {
  /** Dense outline for the silhouette. */
  edge: Pt[];
  /** Coarse outline whose vertices define the facets. */
  facets: Pt[];
}

const SHAPES: readonly GemShape[] = GEM_STYLES.map((s) => s.shape);

function hexToHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return Math.round((l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255);
  };
  return '#' + [f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, '0')).join('');
}

/**
 * Gem look for a picture palette: same hue, lightness kept in a readable range
 * (black/white picture colors become smoky/diamond gems). Cut follows palette order.
 */
export function gemStylesForPalette(colors: readonly string[]): GemStyle[] {
  return colors.map((hex, i) => {
    const [h, s, l] = hexToHsl(hex);
    return { shape: SHAPES[i % SHAPES.length], color: hslToHex(h, s, Math.min(0.72, Math.max(0.4, l))) };
  });
}

function ellipse(rx: number, ry: number, n: number, phase = -Math.PI / 2): Pt[] {
  return Array.from({ length: n }, (_, i) => {
    const a = phase + (i / n) * Math.PI * 2;
    return [Math.cos(a) * rx, Math.sin(a) * ry] as Pt;
  });
}

/** Scales points so their bounding box fits in [-s, s] and is centered. */
function fit(pts: Pt[], s: number): Pt[] {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const k = (2 * s) / Math.max(x1 - x0, y1 - y0);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  return pts.map(([x, y]) => [(x - cx) * k, (y - cy) * k]);
}

function every<T>(arr: T[], step: number): T[] {
  return arr.filter((_, i) => i % step === 0);
}

function chamfer(corners: Pt[], cut: number): Pt[] {
  const out: Pt[] = [];
  corners.forEach((p, i) => {
    const prev = corners[(i + corners.length - 1) % corners.length];
    const next = corners[(i + 1) % corners.length];
    const towards = (q: Pt): Pt => {
      const dx = q[0] - p[0];
      const dy = q[1] - p[1];
      const len = Math.hypot(dx, dy);
      return [p[0] + (dx / len) * cut, p[1] + (dy / len) * cut];
    };
    out.push(towards(prev), towards(next));
  });
  return out;
}

const OUTLINES: Record<GemShape, Outline> = (() => {
  const circle = ellipse(0.92, 0.92, 48);
  const oval = ellipse(0.66, 0.95, 48);
  const heart = fit(
    Array.from({ length: 64 }, (_, i) => {
      const t = (i / 64) * Math.PI * 2;
      const x = 16 * Math.sin(t) ** 3;
      const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
      return [x, y] as Pt;
    }),
    0.95,
  );
  const drop = fit(
    Array.from({ length: 64 }, (_, i) => {
      const t = (i / 64) * Math.PI * 2;
      return [Math.sin(t) * Math.sin(t / 2) ** 1.2, -Math.cos(t)] as Pt;
    }),
    0.96,
  ).map(([x, y]) => [x * 0.9, y] as Pt);
  const square = chamfer(
    [
      [-0.8, -0.8],
      [0.8, -0.8],
      [0.8, 0.8],
      [-0.8, 0.8],
    ],
    0.24,
  );
  const hexagon = ellipse(0.95, 0.95, 6, -Math.PI / 2);
  const star = Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? 1.0 : 0.48;
    return [Math.cos(a) * r, Math.sin(a) * r + 0.07] as Pt;
  });
  const tri = ellipse(1.04, 1.04, 3, -Math.PI / 2).map(([x, y]) => [x, y + 0.16] as Pt);
  const triangle = chamfer(tri, 0.2);
  return {
    circle: { edge: circle, facets: every(circle, 4) },
    oval: { edge: oval, facets: every(oval, 4) },
    heart: { edge: heart, facets: every(heart, 4) },
    drop: { edge: drop, facets: every(drop, 4) },
    square: { edge: square, facets: square },
    hexagon: { edge: hexagon, facets: hexagon },
    star: { edge: star, facets: star },
    triangle: { edge: triangle, facets: triangle },
  };
})();

function polyPath(ctx: CanvasRenderingContext2D, pts: Pt[], r: number, scale = 1, dx = 0, dy = 0): void {
  ctx.moveTo(pts[0][0] * r * scale + dx, pts[0][1] * r * scale + dy);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] * r * scale + dx, pts[i][1] * r * scale + dy);
  ctx.closePath();
}

/** Adds the outline of a gem of radius r centered at (0, 0) to the current path. */
export function shapePath(ctx: CanvasRenderingContext2D, shape: GemShape, r: number): void {
  polyPath(ctx, OUTLINES[shape].edge, r);
}

/** Lightens (amount > 0) or darkens (amount < 0) a #rrggbb color. */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) =>
    Math.round(amount >= 0 ? v + (255 - v) * amount : v * (1 + amount)),
  );
  return '#' + ch.map((v) => v.toString(16).padStart(2, '0')).join('');
}

export function withAlpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

const LIGHT: Pt = [-0.55, -0.83];

/** Draws a cut gem of radius r at (0, 0): crown facets, table, rim and highlight. */
function paintGem(ctx: CanvasRenderingContext2D, st: GemStyle, r: number): void {
  const o = OUTLINES[st.shape];
  const base = st.color;

  ctx.save();
  ctx.beginPath();
  polyPath(ctx, o.edge, r);
  ctx.clip();

  // Body: deep at the lower right, bright towards the light.
  const body = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.05, 0, 0, r * 1.15);
  body.addColorStop(0, shade(base, 0.3));
  body.addColorStop(0.5, base);
  body.addColorStop(1, shade(base, -0.62));
  ctx.fillStyle = body;
  ctx.fillRect(-r * 1.2, -r * 1.2, r * 2.4, r * 2.4);

  // Crown facets between the outline and the table.
  const f = o.facets;
  const T = 0.52;
  const tx = -r * 0.04;
  const ty = -r * 0.06;
  for (let i = 0; i < f.length; i++) {
    const a = f[i];
    const b = f[(i + 1) % f.length];
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    const len = Math.hypot(mx, my) || 1;
    const lit = (mx / len) * LIGHT[0] + (my / len) * LIGHT[1];
    const wobble = i % 2 === 0 ? 0.08 : -0.06;
    const k = lit * 0.68 + wobble;
    ctx.beginPath();
    ctx.moveTo(a[0] * r * 1.08, a[1] * r * 1.08);
    ctx.lineTo(b[0] * r * 1.08, b[1] * r * 1.08);
    ctx.lineTo(b[0] * r * T + tx, b[1] * r * T + ty);
    ctx.lineTo(a[0] * r * T + tx, a[1] * r * T + ty);
    ctx.closePath();
    ctx.fillStyle = k >= 0 ? withAlpha('#ffffff', Math.min(0.6, k * 0.85)) : withAlpha('#14001f', Math.min(0.55, -k * 0.9));
    ctx.fill();
  }

  // Table: the flat top facet.
  ctx.beginPath();
  polyPath(ctx, f, r, T, tx, ty);
  const table = ctx.createLinearGradient(-r * 0.5, -r * 0.6, r * 0.4, r * 0.5);
  table.addColorStop(0, shade(base, 0.42));
  table.addColorStop(0.55, shade(base, 0.04));
  table.addColorStop(1, shade(base, -0.32));
  ctx.fillStyle = table;
  ctx.fill();

  // Facet edges.
  ctx.lineWidth = Math.max(0.6, r * 0.035);
  ctx.strokeStyle = withAlpha('#ffffff', 0.28);
  ctx.beginPath();
  for (const p of f) {
    ctx.moveTo(p[0] * r, p[1] * r);
    ctx.lineTo(p[0] * r * T + tx, p[1] * r * T + ty);
  }
  polyPath(ctx, f, r, T, tx, ty);
  ctx.stroke();

  // Star facets on the table for extra brilliance.
  ctx.strokeStyle = withAlpha('#ffffff', 0.14);
  ctx.beginPath();
  for (const p of f) {
    ctx.moveTo(tx, ty);
    ctx.lineTo(p[0] * r * T + tx, p[1] * r * T + ty);
  }
  ctx.stroke();

  // Soft highlight.
  const hl = ctx.createRadialGradient(-r * 0.32, -r * 0.42, 0, -r * 0.32, -r * 0.42, r * 0.5);
  hl.addColorStop(0, 'rgba(255,255,255,0.9)');
  hl.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  hl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hl;
  ctx.fillRect(-r, -r, r * 2, r * 2);

  // Light bouncing back from the lower right: makes the stone look transparent.
  const fire = ctx.createRadialGradient(r * 0.42, r * 0.5, 0, r * 0.42, r * 0.5, r * 0.55);
  fire.addColorStop(0, withAlpha(shade(base, 0.7), 0.6));
  fire.addColorStop(1, withAlpha(shade(base, 0.7), 0));
  ctx.fillStyle = fire;
  ctx.fillRect(-r, -r, r * 2, r * 2);
  ctx.restore();

  // Rim.
  ctx.beginPath();
  polyPath(ctx, o.edge, r);
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1, r * 0.07);
  ctx.strokeStyle = shade(base, -0.6);
  ctx.stroke();
  ctx.beginPath();
  polyPath(ctx, o.edge, r, 0.93);
  ctx.lineWidth = Math.max(0.6, r * 0.03);
  ctx.strokeStyle = withAlpha(shade(base, 0.6), 0.55);
  ctx.stroke();
}

export type SpriteKind = 'gem' | 'dim' | 'glow';

export interface Sprite {
  canvas: HTMLCanvasElement;
  /** Size in CSS px. */
  w: number;
  h: number;
  /** Radius the sprite was rendered for, CSS px. */
  r: number;
}

/**
 * Pre-renders gems into offscreen canvases, keyed by color, kind and size.
 * Rebuilt only when the layout size, DPR or palette changes.
 */
export class GemAtlas {
  private cache = new Map<string, Sprite>();
  private styles: GemStyle[];
  private dpr = 1;
  glint: Sprite | null = null;

  constructor(styles: readonly GemStyle[] = GEM_STYLES) {
    this.styles = [...styles];
  }

  setStyles(styles: readonly GemStyle[]): void {
    this.styles = [...styles];
    this.cache.clear();
  }

  setDpr(dpr: number): void {
    if (dpr !== this.dpr) {
      this.dpr = dpr;
      this.cache.clear();
      this.glint = null;
    }
  }

  style(c: Color): GemStyle {
    return this.styles[c % this.styles.length];
  }

  get(c: Color, r: number, kind: SpriteKind = 'gem'): Sprite {
    const key = `${kind}:${c}:${Math.round(r * 4)}`;
    let sp = this.cache.get(key);
    if (!sp) {
      sp = this.render(c, r, kind);
      this.cache.set(key, sp);
    }
    return sp;
  }

  private canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(w * this.dpr);
    cv.height = Math.ceil(h * this.dpr);
    const ctx = cv.getContext('2d')!;
    ctx.scale(this.dpr, this.dpr);
    return [cv, ctx];
  }

  private render(c: Color, r: number, kind: SpriteKind): Sprite {
    const st = this.style(c);
    const size = r * (kind === 'glow' ? 3.4 : 2.3);
    const [cv, ctx] = this.canvas(size, size);
    ctx.translate(size / 2, size / 2);
    if (kind === 'glow') {
      const g = ctx.createRadialGradient(0, 0, r * 0.4, 0, 0, size / 2);
      g.addColorStop(0, withAlpha(shade(st.color, 0.6), 0.85));
      g.addColorStop(0.45, withAlpha(st.color, 0.35));
      g.addColorStop(1, withAlpha(st.color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(-size / 2, -size / 2, size, size);
    } else {
      paintGem(ctx, st, r);
      if (kind === 'dim') {
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = 'rgba(28,14,48,0.58)';
        ctx.fillRect(-size / 2, -size / 2, size, size);
      }
    }
    return { canvas: cv, w: size, h: size, r };
  }

  /** A small four-point sparkle used for twinkles and particles. */
  getGlint(): Sprite {
    if (this.glint) return this.glint;
    const size = 32;
    const [cv, ctx] = this.canvas(size, size);
    ctx.translate(size / 2, size / 2);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.2, 'rgba(255,250,255,0.55)');
    g.addColorStop(1, 'rgba(255,240,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, -size / 2);
    ctx.quadraticCurveTo(1.5, -1.5, size / 2, 0);
    ctx.quadraticCurveTo(1.5, 1.5, 0, size / 2);
    ctx.quadraticCurveTo(-1.5, 1.5, -size / 2, 0);
    ctx.quadraticCurveTo(-1.5, -1.5, 0, -size / 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.16, 0, Math.PI * 2);
    ctx.fill();
    this.glint = { canvas: cv, w: size, h: size, r: size / 2 };
    return this.glint;
  }
}

/** Draws a sprite centered at (x, y), scaled so it matches radius r. */
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  sp: Sprite,
  x: number,
  y: number,
  r: number = sp.r,
  sx = 1,
  sy = 1,
): void {
  const k = r / sp.r;
  const w = sp.w * k * sx;
  const h = sp.h * k * sy;
  ctx.drawImage(sp.canvas, x - w / 2, y - h / 2, w, h);
}
