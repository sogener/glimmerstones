import { bump, clamp01, easeInOutCubic, easeOutBack, lerp } from '../anim/easing.ts';
import { colorCounts } from '../core/board.ts';
import { cellColors, paletteKeys, partition, type Piece, type PictureData } from '../core/picture.ts';
import type { Board } from '../core/types.ts';
import { shade, withAlpha } from './gems.ts';
import type { Rect } from './layout.ts';

export interface PieceRef {
  color: number;
  index: number;
}

const DROP_MS = 300;
const CELEBRATE_MOVE = 700;
const CELEBRATE_TOTAL = 1900;

function cellHash(i: number): number {
  let h = Math.imul(i + 1, 0x9e3779b1);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** Draws one pebble (mosaic tile) of size s at (0, 0). */
function paintPebble(ctx: CanvasRenderingContext2D, color: string, s: number): void {
  const r = s / 2;
  ctx.beginPath();
  ctx.roundRect(-r, -r, s, s, s * 0.38);
  const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, 0, 0, 0, r * 1.25);
  g.addColorStop(0, shade(color, 0.45));
  g.addColorStop(0.5, color);
  g.addColorStop(1, shade(color, -0.35));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-r * 0.3, -r * 0.35, r * 0.28, r * 0.17, -0.5, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fill();
}

/** Renders the finished picture as pebbles into a new canvas (for cards and the gallery). */
export function renderPictureThumbnail(pic: PictureData, cell: number, dpr = 1): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(pic.width * cell * dpr);
  cv.height = Math.ceil(pic.height * cell * dpr);
  const ctx = cv.getContext('2d')!;
  ctx.scale(dpr, dpr);
  const keys = paletteKeys(pic);
  pic.rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (!keys.includes(ch)) return;
      ctx.save();
      ctx.translate((x + 0.5) * cell, (y + 0.5) * cell);
      paintPebble(ctx, pic.palette[ch], cell * 1.02);
      ctx.restore();
    }),
  );
  return cv;
}

/**
 * The reward picture above the shelves. Starts as a pale outline; each collected
 * triple fills one piece with pebbles. Fill state can always be re-derived from the board.
 */
export class PictureView {
  pic!: PictureData;
  private pieces: Piece[][] = [];
  private colors: string[] = [];
  private triples: number[] = [];
  /** Per color, per piece: time the pebbles start pouring in (null = empty). */
  private fills: (number | null)[][] = [];
  private rect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private bigRect: Rect | null = null;
  private celebrateAt: number | null = null;
  private dpr = 1;
  private faint: HTMLCanvasElement | null = null;
  private faintKey = '';
  private faintCell = 1;
  /** Settled pebbles, re-rendered only when a piece finishes pouring. */
  private settled: HTMLCanvasElement | null = null;
  private settledKey = '';
  private settledCell = 1;
  private pebbles = new Map<string, HTMLCanvasElement>();

  setPicture(pic: PictureData, triples: readonly number[]): void {
    this.pic = pic;
    this.triples = [...triples];
    this.pieces = partition(pic, triples);
    this.colors = paletteKeys(pic).map((k) => pic.palette[k]);
    this.colorOfCell = cellColors(pic);
    this.fills = this.pieces.map((list) => list.map(() => null));
    this.celebrateAt = null;
    this.bigRect = null;
    this.faintKey = '';
    this.settledKey = '';
  }

  setRect(rect: Rect, dpr: number): void {
    this.rect = rect;
    if (dpr !== this.dpr) {
      this.dpr = dpr;
      this.pebbles.clear();
    }
  }

  /** Snaps the fill state to the board (after undo, restart, a new level). */
  sync(board: Board): void {
    const left = colorCounts(board);
    this.fills.forEach((list, c) => {
      const target = this.triples[c] - Math.round((left[c] ?? 0) / 3);
      let have = list.filter((f) => f !== null).length;
      for (let i = list.length - 1; i >= 0 && have > target; i--) {
        if (list[i] !== null) {
          list[i] = null;
          have--;
        }
      }
      for (let i = 0; i < list.length && have < target; i++) {
        if (list[i] === null) {
          list[i] = -Infinity;
          have++;
        }
      }
    });
    this.celebrateAt = null;
    this.bigRect = null;
  }

  /** Books the next empty piece of a color for a flying triple; returns its center. */
  reserve(color: number): { ref: PieceRef; x: number; y: number; size: number } | null {
    const list = this.fills[color];
    if (!list) return null;
    const index = list.findIndex((f) => f === null);
    if (index < 0) return null;
    list[index] = Infinity; // reserved, pebbles arrive later
    const g = this.geometry(this.rect);
    const pc = this.pieces[color][index];
    return { ref: { color, index }, x: g.x + pc.cx * g.cell, y: g.y + pc.cy * g.cell, size: g.cell };
  }

  arrive(ref: PieceRef, at: number): void {
    if (this.fills[ref.color]) this.fills[ref.color][ref.index] = at;
  }

  celebrate(now: number, big: Rect): void {
    this.celebrateAt = now;
    this.bigRect = big;
  }

  get celebrating(): boolean {
    return this.celebrateAt !== null;
  }

  busy(now: number): boolean {
    if (this.celebrateAt !== null && now < this.celebrateAt + CELEBRATE_TOTAL) return true;
    return this.fills.some((list, c) =>
      list.some((f, i) => f !== null && f !== -Infinity && now < f + this.pourTime(this.pieces[c][i]) + DROP_MS),
    );
  }

  private pourTime(p: Piece): number {
    return Math.min(40, 520 / p.cells.length) * p.cells.length;
  }

  private currentRect(now: number): Rect {
    if (this.celebrateAt === null || !this.bigRect) return this.rect;
    const k = easeInOutCubic(clamp01((now - this.celebrateAt) / CELEBRATE_MOVE));
    const a = this.rect;
    const b = this.bigRect;
    return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), w: lerp(a.w, b.w, k), h: lerp(a.h, b.h, k) };
  }

  /** Cell size and top-left corner of the picture inside a rect. */
  private geometry(r: Rect): { cell: number; x: number; y: number } {
    const pad = 14;
    const cell = Math.max(2, Math.min((r.w - pad * 2) / this.pic.width, (r.h - pad * 2) / this.pic.height));
    const w = cell * this.pic.width;
    const h = cell * this.pic.height;
    return { cell, x: r.x + (r.w - w) / 2, y: r.y + (r.h - h) / 2 };
  }

  private pebble(color: number, size: number): HTMLCanvasElement {
    const px = Math.max(2, Math.round(size * this.dpr));
    const key = `${color}:${px}`;
    let cv = this.pebbles.get(key);
    if (!cv) {
      cv = document.createElement('canvas');
      cv.width = cv.height = px + 2;
      const ctx = cv.getContext('2d')!;
      ctx.translate((px + 2) / 2, (px + 2) / 2);
      paintPebble(ctx, this.colors[color], px);
      this.pebbles.set(key, cv);
    }
    return cv;
  }

  /** Pale outline + faint tint of every cell; cached per size. */
  private faintLayer(cell: number, w: number, h: number): HTMLCanvasElement {
    const key = `${this.pic.id}:${cell.toFixed(2)}:${this.dpr}`;
    if (this.faint && this.faintKey === key) return this.faint;
    this.faintCell = cell;
    const cv = this.faint ?? document.createElement('canvas');
    cv.width = Math.ceil(w * this.dpr) + 4;
    cv.height = Math.ceil(h * this.dpr) + 4;
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 2, 2);
    const filled = (x: number, y: number) =>
      x >= 0 && y >= 0 && x < this.pic.width && y < this.pic.height && this.pic.rows[y][x] !== '.';
    this.pic.rows.forEach((row, y) =>
      [...row].forEach((ch, x) => {
        if (ch === '.') return;
        const col = this.pic.palette[ch] ?? '#ffffff';
        ctx.fillStyle = withAlpha(col, 0.16);
        ctx.beginPath();
        ctx.roundRect(x * cell + cell * 0.08, y * cell + cell * 0.08, cell * 0.84, cell * 0.84, cell * 0.3);
        ctx.fill();
      }),
    );
    ctx.strokeStyle = 'rgba(255,236,250,0.5)';
    ctx.lineWidth = Math.max(1, cell * 0.12);
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let y = 0; y < this.pic.height; y++)
      for (let x = 0; x < this.pic.width; x++) {
        if (!filled(x, y)) continue;
        if (!filled(x, y - 1)) (ctx.moveTo(x * cell, y * cell), ctx.lineTo((x + 1) * cell, y * cell));
        if (!filled(x, y + 1)) (ctx.moveTo(x * cell, (y + 1) * cell), ctx.lineTo((x + 1) * cell, (y + 1) * cell));
        if (!filled(x - 1, y)) (ctx.moveTo(x * cell, y * cell), ctx.lineTo(x * cell, (y + 1) * cell));
        if (!filled(x + 1, y)) (ctx.moveTo((x + 1) * cell, y * cell), ctx.lineTo((x + 1) * cell, (y + 1) * cell));
      }
    ctx.stroke();
    this.faint = cv;
    this.faintKey = key;
    return cv;
  }

  draw(ctx: CanvasRenderingContext2D, now: number): void {
    if (!this.pic) return;
    const r = this.currentRect(now);
    const g = this.geometry(r);
    const w = g.cell * this.pic.width;
    const h = g.cell * this.pic.height;

    // Frame.
    const fp = g.cell * 0.9 + 4;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(g.x - fp, g.y - fp, w + fp * 2, h + fp * 2, fp * 1.2);
    const bg = ctx.createLinearGradient(0, g.y - fp, 0, g.y + h + fp);
    bg.addColorStop(0, 'rgba(58,33,96,0.85)');
    bg.addColorStop(1, 'rgba(34,19,60,0.85)');
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255,215,150,0.35)';
    ctx.stroke();
    ctx.restore();

    // Pale outline (cached at the resting size, scaled while celebrating).
    const baseCell = this.geometry(this.rect).cell;
    const faint = this.faintLayer(baseCell, baseCell * this.pic.width, baseCell * this.pic.height);
    const fk = g.cell / this.faintCell;
    ctx.drawImage(faint, g.x - (2 / this.dpr) * fk, g.y - (2 / this.dpr) * fk, (faint.width / this.dpr) * fk, (faint.height / this.dpr) * fk);

    // Settled pebbles from the cache, pouring ones live.
    const cacheCell = this.celebrateAt !== null && this.bigRect ? this.geometry(this.bigRect).cell : baseCell;
    const settledIds: string[] = [];
    const pouring: [number, number, number][] = [];
    this.pieces.forEach((list, c) =>
      list.forEach((piece, pi) => {
        const f = this.fills[c][pi];
        if (f === null || f === Infinity) return;
        if (f === -Infinity || now >= f + this.pourTime(piece) + DROP_MS) settledIds.push(`${c}.${pi}`);
        else pouring.push([c, pi, f]);
      }),
    );
    const key = `${settledIds.join(',')}|${cacheCell.toFixed(2)}|${this.dpr}`;
    if (key !== this.settledKey) this.renderSettled(settledIds, cacheCell, key);
    if (this.settled && settledIds.length > 0) {
      const k = g.cell / this.settledCell;
      ctx.drawImage(this.settled, g.x, g.y, (this.settled.width / this.dpr) * k, (this.settled.height / this.dpr) * k);
    }
    const W = this.pic.width;
    for (const [c, pi, f] of pouring) {
      const piece = this.pieces[c][pi];
      const stagger = Math.min(40, 520 / piece.cells.length);
      piece.cells.forEach((cell, k) => {
        const t = now - f - k * stagger;
        if (t < 0) return;
        const x = cell % W;
        const y = (cell - x) / W;
        const j = cellHash(cell);
        let s = g.cell * (0.98 + j * 0.08);
        let py = g.y + (y + 0.5) * g.cell;
        let alpha = 1;
        if (t < DROP_MS) {
          const e = easeOutBack(t / DROP_MS, 1.8);
          py -= (1 - e) * g.cell * 2.2;
          s *= 0.55 + 0.45 * e;
          alpha = Math.min(1, t / 90);
        }
        const px = g.x + (x + 0.5) * g.cell + (j - 0.5) * g.cell * 0.08;
        ctx.globalAlpha = alpha;
        ctx.drawImage(this.pebble(c, g.cell), px - s / 2, py - s / 2, s, s);
      });
    }
    ctx.globalAlpha = 1;

    // Celebration: a shimmering wave runs diagonally across the picture.
    const cs = this.celebrateAt;
    if (cs !== null) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const colors = this.colorOfCell;
      for (let i = 0; i < colors.length; i++) {
        const c = colors[i];
        if (c < 0) continue;
        const x = i % W;
        const y = (i - x) / W;
        const wave = bump((now - cs - CELEBRATE_MOVE * 0.6 - (x + y) * 28) / 380);
        if (wave <= 0) continue;
        const j = cellHash(i);
        const s = g.cell * (0.98 + j * 0.08);
        const px = g.x + (x + 0.5) * g.cell + (j - 0.5) * g.cell * 0.08;
        const py = g.y + (y + 0.5) * g.cell;
        ctx.globalAlpha = wave * 0.65;
        ctx.drawImage(this.pebble(c, g.cell), px - s / 2, py - s / 2, s, s);
      }
      ctx.restore();
    }
  }

  private colorOfCell: number[] = [];

  private renderSettled(ids: string[], cell: number, key: string): void {
    this.settledKey = key;
    this.settledCell = cell;
    const cv = this.settled ?? document.createElement('canvas');
    cv.width = Math.ceil(cell * this.pic.width * this.dpr);
    cv.height = Math.ceil(cell * this.pic.height * this.dpr);
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    const W = this.pic.width;
    for (const id of ids) {
      const [c, pi] = id.split('.').map(Number);
      for (const i of this.pieces[c][pi].cells) {
        const x = i % W;
        const y = (i - x) / W;
        const j = cellHash(i);
        const s = cell * (0.98 + j * 0.08);
        const px = (x + 0.5) * cell + (j - 0.5) * cell * 0.08;
        const py = (y + 0.5) * cell;
        ctx.drawImage(this.pebble(c, cell), px - s / 2, py - s / 2, s, s);
      }
    }
    this.settled = cv;
  }

  /** Where the picture currently is (for celebration sparkles). */
  bounds(now: number): Rect {
    const r = this.currentRect(now);
    const g = this.geometry(r);
    return { x: g.x, y: g.y, w: g.cell * this.pic.width, h: g.cell * this.pic.height };
  }
}
