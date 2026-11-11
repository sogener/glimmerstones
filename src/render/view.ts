import {
  bump,
  clamp01,
  easeInCubic,
  easeInOutCubic,
  easeOutBack,
  easeOutCubic,
  lerp,
} from '../anim/easing.ts';
import { applyEvent, setCell, type BoardEvent } from '../core/board.ts';
import type { Board, CellRef, Color, Shelf } from '../core/types.ts';
import { drawSprite, GemAtlas } from './gems.ts';
import { lerpLayout, type Layout, type ShelfLayout } from './layout.ts';
import { Particles } from './particles.ts';
import type { PieceRef } from './picture.ts';
import { drawBackground, drawShelfBack, drawShelfFront, ShelfLayers } from './shelves.ts';

/** Timings, ms. */
const T = {
  land: 200,
  tripleGather: 380,
  tripleSwell: 220,
  toPicture: 560,
  toPictureStagger: 80,
  flash: 520,
  advance: 400,
  advanceStagger: 50,
  layout: 380,
};

type Anim =
  | { type: 'land'; cell: number; start: number; dur: number }
  | { type: 'triple'; color: Color; start: number; dur: number }
  | { type: 'advance'; stones: readonly Color[]; start: number; dur: number }
  | { type: 'appear'; start: number; dur: number };

type DistOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

interface Step {
  at: number;
  shelf: Shelf;
  anim: DistOmit<Anim, 'start'> | null;
}

interface Flyer {
  color: Color;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  start: number;
  dur: number;
  arc: number;
  /** Cell kept hidden until the flyer lands (used when a dragged stone returns). */
  hide?: CellRef;
}

/** Receives collected triples (the reward picture). */
export interface TripleSink {
  reserve(color: Color): { ref: PieceRef; x: number; y: number; size: number } | null;
  arrive(ref: PieceRef, at: number): void;
}

interface PicFlyer {
  color: Color;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  r1: number;
  start: number;
  dur: number;
}

interface Flash {
  x: number;
  y: number;
  color: Color;
  start: number;
}

export interface DragState {
  from: CellRef;
  color: Color;
  x: number;
  y: number;
}

function hash(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Visual state of the board. It lags behind the logic board while animations play:
 * every shelf has its own queue of timed steps, flying stones are drawn on top.
 */
export class BoardView {
  readonly atlas = new GemAtlas();
  private layers = new ShelfLayers();
  private particles = new Particles();
  private shown: Shelf[] = [];
  private anims: (Anim | null)[] = [];
  private queues: Step[][] = [];
  private flyers: Flyer[] = [];
  private picFlyers: PicFlyer[] = [];
  private flashes: Flash[] = [];
  /** Where collected triples fly to; without it they just flash on the shelf. */
  tripleSink: TripleSink | null = null;

  layout!: Layout;
  private fromLayout: Layout | null = null;
  private layoutStart = 0;
  private w = 0;
  private h = 0;
  private dpr = 1;

  selected: CellRef | null = null;
  drag: DragState | null = null;
  hint: { from: CellRef; to: number; start: number } | null = null;

  setSize(w: number, h: number, dpr: number): void {
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.atlas.setDpr(dpr);
    this.layers.invalidate();
  }

  /** Sets a new target layout, optionally animating shelves to their new places. */
  setLayout(layout: Layout, now: number, animate = false): void {
    this.fromLayout = animate && this.layout ? this.currentLayout(now) : null;
    this.layoutStart = now;
    this.layout = layout;
  }

  private currentLayout(now: number): Layout {
    if (!this.fromLayout) return this.layout;
    const k = (now - this.layoutStart) / T.layout;
    if (k >= 1) {
      this.fromLayout = null;
      return this.layout;
    }
    return lerpLayout(this.fromLayout, this.layout, easeInOutCubic(k));
  }

  /** Shows the board immediately, dropping all running animations. */
  setBoard(b: Board): void {
    this.shown = [...b.shelves];
    this.anims = b.shelves.map(() => null);
    this.queues = b.shelves.map(() => []);
    this.flyers = [];
    this.picFlyers = [];
  }

  /** Marks the last shelf as freshly added. */
  appearLast(now: number): void {
    const i = this.shown.length - 1;
    if (i >= 0) this.anims[i] = { type: 'appear', start: now, dur: T.layout + 120 };
  }

  /** Jumps all queued animation steps to their end state. */
  flush(now = performance.now()): void {
    this.queues.forEach((q, i) => {
      for (const step of q) if (step.anim?.type === 'triple') this.onTriple(i, step.anim.color, now);
      if (q.length > 0) this.shown[i] = q[q.length - 1].shelf;
      q.length = 0;
      this.anims[i] = null;
    });
    this.flyers = [];
  }

  busy(now: number): boolean {
    return (
      this.flyers.length > 0 ||
      this.picFlyers.length > 0 ||
      this.queues.some((q) => q.length > 0) ||
      this.anims.some((a) => a !== null && now < a.start + a.dur) ||
      this.fromLayout !== null
    );
  }

  /** Where a front stone sits (CSS px). */
  stonePos(ref: CellRef): { x: number; y: number } {
    const L = this.layout.shelves[ref.shelf];
    return { x: L.cellX[ref.cell], y: L.gemY };
  }

  selectedLift(): number {
    return this.layout.cell * 0.2;
  }

  /** Animates a move that the logic board has already applied. */
  playMove(
    before: Board,
    from: CellRef,
    to: CellRef,
    events: readonly BoardEvent[],
    now: number,
    start?: { x: number; y: number },
  ): void {
    this.flush();
    const stone = before.shelves[from.shelf].front[from.cell] as Color;
    const s1 = setCell(before, from, null);
    const s2 = setCell(s1, to, stone);
    this.shown[from.shelf] = s1.shelves[from.shelf];
    this.anims[from.shelf] = null;

    const p0 = start ?? { x: this.stonePos(from).x, y: this.stonePos(from).y - this.selectedLift() };
    const p1 = this.stonePos(to);
    const dist = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    const fly = Math.min(470, Math.max(260, 230 + dist * 0.38));
    this.flyers.push({
      color: stone,
      x0: p0.x,
      y0: p0.y,
      x1: p1.x,
      y1: p1.y,
      start: now,
      dur: fly,
      arc: this.layout.cell * 0.35 + dist * 0.16,
    });
    this.queues[to.shelf].push({
      at: now + fly,
      shelf: s2.shelves[to.shelf],
      anim: { type: 'land', cell: to.cell, dur: T.land },
    });

    let cur = s2;
    const clock = new Map<number, number>([
      [to.shelf, now + fly],
      [from.shelf, now + 70],
    ]);
    for (const e of events) {
      cur = applyEvent(cur, e);
      let t = clock.get(e.shelf) ?? now;
      if (e.type === 'triple') {
        t += 60;
        const dur = this.tripleSink ? T.tripleSwell : T.tripleGather;
        this.queues[e.shelf].push({
          at: t,
          shelf: cur.shelves[e.shelf],
          anim: { type: 'triple', color: e.color, dur },
        });
        t += dur + (this.tripleSink ? 40 : 60);
      } else {
        this.queues[e.shelf].push({
          at: t,
          shelf: cur.shelves[e.shelf],
          anim: { type: 'advance', stones: e.stones, dur: T.advance },
        });
        t += T.advance;
      }
      clock.set(e.shelf, t);
    }
  }

  /** A dragged stone that was dropped nowhere flies back home. */
  returnStone(from: CellRef, color: Color, x: number, y: number, now: number): void {
    const p1 = this.stonePos(from);
    this.flyers.push({
      color,
      x0: x,
      y0: y,
      x1: p1.x,
      y1: p1.y,
      start: now,
      dur: 240,
      arc: this.layout.cell * 0.2,
      hide: from,
    });
  }

  private update(now: number): void {
    this.queues.forEach((q, i) => {
      while (q.length > 0 && q[0].at <= now) {
        const step = q.shift()!;
        this.shown[i] = step.shelf;
        this.anims[i] = step.anim ? ({ ...step.anim, start: step.at } as Anim) : null;
        if (step.anim?.type === 'triple') this.onTriple(i, step.anim.color, step.at);
      }
      const a = this.anims[i];
      if (a && now >= a.start + a.dur) this.anims[i] = null;
    });
    this.flyers = this.flyers.filter((f) => now < f.start + f.dur);
    this.picFlyers = this.picFlyers.filter((f) => now < f.start + f.dur);
    this.flashes = this.flashes.filter((f) => now < f.start + T.flash);
  }

  /** A triple was collected on a shelf at time `at`: fly it into the picture (or flash). */
  private onTriple(shelf: number, color: Color, at: number): void {
    const target = this.tripleSink?.reserve(color);
    if (!target) {
      this.scheduleFlash(shelf, color, at);
      return;
    }
    const L = this.layout.shelves[shelf];
    const lift = this.layout.gemR * 0.25;
    let arrive = at;
    for (let j = 0; j < 3; j++) {
      const x0 = L.cellX[j];
      const y0 = L.gemY - lift;
      const dist = Math.hypot(target.x - x0, target.y - y0);
      const start = at + T.tripleSwell + j * T.toPictureStagger;
      const dur = T.toPicture + dist * 0.22;
      this.picFlyers.push({ color, x0, y0, x1: target.x, y1: target.y, r1: target.size * 0.6, start, dur });
      arrive = Math.max(arrive, start + dur);
    }
    this.tripleSink!.arrive(target.ref, arrive - 140);
    const glint = this.atlas.getGlint();
    this.particles.burst(glint, target.x, target.y, arrive - 80, {
      count: 12,
      speed: 0.07,
      size: Math.max(6, target.size * 1.2),
      life: 600,
      gravity: 0.00004,
    });
  }

  /** A burst of sparkles anywhere (used by the win celebration). */
  sparkle(x: number, y: number, at: number): void {
    const glint = this.atlas.getGlint();
    this.particles.burst(glint, x, y, at, { count: 10, speed: 0.09, size: this.layout.cell * 0.3, life: 800 });
  }

  /** Particles only (drawn above the celebrating picture). */
  drawParticles(ctx: CanvasRenderingContext2D, now: number): void {
    this.particles.draw(ctx, now);
  }

  private scheduleFlash(shelf: number, color: Color, at: number): void {
    const L = this.layout.shelves[shelf];
    const x = L.cellX[1];
    const y = L.gemY;
    const start = at + T.tripleGather * 0.85;
    this.flashes.push({ x, y, color, start });
    const glint = this.atlas.getGlint();
    this.particles.burst(glint, x, y, start, { count: 18, speed: 0.16, size: this.layout.cell * 0.22, life: 700 });
    this.particles.burst(glint, x, y, start + 80, { count: 8, speed: 0.07, size: this.layout.cell * 0.32, life: 500 });
  }

  draw(ctx: CanvasRenderingContext2D, now: number): void {
    this.update(now);
    const layout = this.currentLayout(now);
    const tweening = this.fromLayout !== null;
    const cell = layout.cell;

    // 1. Background and tray backs.
    if (tweening) {
      drawBackground(ctx, this.w, this.h);
      layout.shelves.forEach((L, i) => drawShelfBack(ctx, L, cell, this.appearAlpha(i, now)));
    } else {
      this.layers.update(this.layout, this.w, this.h, this.dpr);
      ctx.drawImage(this.layers.back, 0, 0, this.w, this.h);
    }

    // 2. Stones resting in the trays.
    this.shown.forEach((shelf, i) => {
      const L = layout.shelves[i];
      if (L) this.drawShelfStones(ctx, shelf, i, L, layout, now);
    });

    // 3. Tray lips in front of the stones.
    if (tweening) layout.shelves.forEach((L, i) => drawShelfFront(ctx, L, this.appearAlpha(i, now)));
    else ctx.drawImage(this.layers.front, 0, 0, this.w, this.h);

    // 4. Hint, lifted, flying and dragged stones, effects.
    this.drawHint(ctx, layout, now);
    this.drawSelected(ctx, layout, now);
    for (const f of this.flyers) this.drawFlyer(ctx, f, layout, now);
    for (const f of this.picFlyers) this.drawPicFlyer(ctx, f, layout, now);
    if (this.drag) {
      const d = this.drag;
      const r = layout.gemR * 1.12;
      this.glow(ctx, d.color, d.x, d.y, r, 0.9);
      drawSprite(ctx, this.atlas.get(d.color, this.layout.gemR), d.x, d.y, r);
    }
    this.drawFlashes(ctx, layout, now);
    if (!this.particlesOnTop) this.particles.draw(ctx, now);
  }

  /** When true, draw() skips particles so the caller can draw them above other layers. */
  particlesOnTop = false;

  private appearAlpha(i: number, now: number): number {
    const a = this.anims[i];
    if (a?.type !== 'appear') return 1;
    return clamp01((now - a.start) / a.dur);
  }

  private glow(ctx: CanvasRenderingContext2D, c: Color, x: number, y: number, r: number, alpha: number): void {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha;
    drawSprite(ctx, this.atlas.get(c, this.layout.gemR, 'glow'), x, y, r);
    ctx.restore();
  }

  private isHidden(i: number, c: number, now: number): boolean {
    if (this.drag && this.drag.from.shelf === i && this.drag.from.cell === c) return true;
    if (this.selected && this.selected.shelf === i && this.selected.cell === c) return true;
    return this.flyers.some((f) => f.hide && f.hide.shelf === i && f.hide.cell === c && now < f.start + f.dur);
  }

  private drawShelfStones(
    ctx: CanvasRenderingContext2D,
    shelf: Shelf,
    i: number,
    L: ShelfLayout,
    layout: Layout,
    now: number,
  ): void {
    const anim = this.anims[i];
    const appear = this.appearAlpha(i, now);
    const atlas = this.atlas;
    const gemR = layout.gemR;
    const peekR = layout.peekR;

    // Next hidden layer peeks from behind; it fades in after an advance.
    const next = shelf.layers[0];
    if (next) {
      const k = anim?.type === 'advance' ? clamp01((now - anim.start) / anim.dur) : 1;
      ctx.save();
      ctx.globalAlpha = k * appear;
      next.forEach((c, j) => drawSprite(ctx, atlas.get(c, this.layout.peekR, 'dim'), L.cellX[j], L.peekY, peekR));
      ctx.restore();
      if (shelf.layers.length > 1) this.drawBadge(ctx, L, layout.cell, shelf.layers.length - 1);
    }

    // Free sockets glow softly while a stone is picked up.
    const holding = this.selected ?? this.drag?.from ?? null;
    if (holding && holding.shelf !== i) {
      const a = 0.22 + 0.1 * Math.sin(now / 260);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      shelf.front.forEach((c, j) => {
        if (c !== null) return;
        const g = ctx.createRadialGradient(L.cellX[j], L.gemY + layout.cell * 0.2, 0, L.cellX[j], L.gemY, gemR);
        g.addColorStop(0, `rgba(255,220,255,${a})`);
        g.addColorStop(1, 'rgba(255,220,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(L.cellX[j] - gemR, L.gemY - gemR, gemR * 2, gemR * 2);
      });
      ctx.restore();
    }

    if (anim?.type === 'triple') {
      this.drawTriple(ctx, anim, L, gemR, now);
      return;
    }

    shelf.front.forEach((c, j) => {
      if (c === null || this.isHidden(i, j, now)) return;
      let x = L.cellX[j];
      let y = L.gemY;
      let r = gemR;
      let sx = 1;
      let sy = 1;
      if (anim?.type === 'advance') {
        const k = clamp01((now - anim.start - j * T.advanceStagger) / (anim.dur - 2 * T.advanceStagger));
        const e = easeOutBack(k, 1.2);
        y = lerp(L.peekY, L.gemY, e);
        r = lerp(peekR, gemR, easeOutCubic(k));
        // Cross-fade from the dimmed look to the bright one.
        ctx.save();
        ctx.globalAlpha = 1 - k;
        drawSprite(ctx, atlas.get(c, this.layout.peekR, 'dim'), x, y, r);
        ctx.globalAlpha = k;
        drawSprite(ctx, atlas.get(c, this.layout.gemR), x, y, r);
        ctx.restore();
        return;
      }
      if (anim?.type === 'land' && anim.cell === j) {
        const b = bump((now - anim.start) / anim.dur);
        sx = 1 + 0.1 * b;
        sy = 1 - 0.12 * b;
        y += gemR * 0.12 * b;
      }
      if (appear < 1) {
        ctx.save();
        ctx.globalAlpha = appear;
      }
      drawSprite(ctx, atlas.get(c, this.layout.gemR), x, y, r, sx, sy);
      this.twinkle(ctx, i * 3 + j, x, y, r, now);
      if (appear < 1) ctx.restore();
    });
  }

  private drawTriple(ctx: CanvasRenderingContext2D, anim: Extract<Anim, { type: 'triple' }>, L: ShelfLayout, gemR: number, now: number): void {
    const k = clamp01((now - anim.start) / anim.dur);
    if (this.tripleSink) {
      // Stones swell and rise; then they leave as picture flyers.
      const sw = easeOutCubic(k);
      for (let j = 0; j < 3; j++) {
        const y = L.gemY - gemR * 0.25 * sw;
        const r = gemR * (1 + 0.15 * sw);
        this.glow(ctx, anim.color, L.cellX[j], y, r, 0.3 + 0.5 * sw);
        drawSprite(ctx, this.atlas.get(anim.color, this.layout.gemR), L.cellX[j], y, r);
      }
      return;
    }
    const cx = L.cellX[1];
    const swell = easeOutCubic(clamp01(k / 0.35));
    const gather = easeInCubic(clamp01((k - 0.3) / 0.7));
    for (let j = 0; j < 3; j++) {
      const x = lerp(L.cellX[j], cx, gather);
      const y = L.gemY - gemR * 0.15 * swell;
      const r = gemR * (1 + 0.14 * swell - 0.35 * gather);
      this.glow(ctx, anim.color, x, y, r, 0.35 + 0.5 * swell);
      ctx.save();
      ctx.globalAlpha = 1 - gather * 0.6;
      drawSprite(ctx, this.atlas.get(anim.color, this.layout.gemR), x, y, r);
      ctx.restore();
    }
  }

  private drawFlashes(ctx: CanvasRenderingContext2D, layout: Layout, now: number): void {
    for (const f of this.flashes) {
      const k = (now - f.start) / T.flash;
      if (k < 0) continue;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // Bright core.
      ctx.globalAlpha = (1 - k) ** 2;
      this.glow(ctx, f.color, f.x, f.y, layout.gemR * (1 + k * 1.2), 1);
      // Expanding ring.
      ctx.globalAlpha = (1 - k) * 0.8;
      ctx.beginPath();
      ctx.arc(f.x, f.y, layout.cell * (0.3 + easeOutCubic(k) * 1.1), 0, Math.PI * 2);
      ctx.lineWidth = layout.cell * 0.08 * (1 - k);
      ctx.strokeStyle = '#fff6fd';
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawFlyer(ctx: CanvasRenderingContext2D, f: Flyer, layout: Layout, now: number): void {
    const k = clamp01((now - f.start) / f.dur);
    const e = easeInOutCubic(k);
    const x = lerp(f.x0, f.x1, e);
    const y = lerp(f.y0, f.y1, e) - Math.sin(Math.PI * e) * f.arc;
    const r = layout.gemR * (1 + 0.12 * bump(k));
    this.glow(ctx, f.color, x, y, r, 0.5 * bump(k) + 0.2);
    drawSprite(ctx, this.atlas.get(f.color, this.layout.gemR), x, y, r);
  }

  private drawPicFlyer(ctx: CanvasRenderingContext2D, f: PicFlyer, layout: Layout, now: number): void {
    if (now < f.start) {
      // Waiting for its turn: hover in place, still glowing.
      const r = layout.gemR * 1.15;
      this.glow(ctx, f.color, f.x0, f.y0, r, 0.8);
      drawSprite(ctx, this.atlas.get(f.color, this.layout.gemR), f.x0, f.y0, r);
      return;
    }
    const k = clamp01((now - f.start) / f.dur);
    const e = easeInOutCubic(k);
    const x = lerp(f.x0, f.x1, e);
    const lift = Math.min(layout.cell * 2.2, Math.abs(f.y0 - f.y1) * 0.35 + layout.cell);
    const y = lerp(f.y0, f.y1, e) - Math.sin(Math.PI * e) * lift;
    const r = lerp(layout.gemR * 1.15, f.r1, easeInCubic(k));
    this.glow(ctx, f.color, x, y, r * 1.1, 0.85 - 0.4 * k);
    drawSprite(ctx, this.atlas.get(f.color, this.layout.gemR), x, y, r);
  }

  private drawSelected(ctx: CanvasRenderingContext2D, layout: Layout, now: number): void {
    const s = this.selected;
    if (!s || this.drag) return;
    const c = this.shown[s.shelf]?.front[s.cell];
    const L = layout.shelves[s.shelf];
    if (c === null || c === undefined || !L) return;
    const x = L.cellX[s.cell];
    const y = L.gemY - layout.cell * (0.2 + 0.03 * Math.sin(now / 200));
    const r = layout.gemR * 1.08;
    this.glow(ctx, c, x, y, r, 0.75 + 0.2 * Math.sin(now / 200));
    drawSprite(ctx, this.atlas.get(c, this.layout.gemR), x, y, r);
    this.twinkle(ctx, 999, x, y, r, now, true);
  }

  private drawHint(ctx: CanvasRenderingContext2D, layout: Layout, now: number): void {
    const h = this.hint;
    if (!h) return;
    const L = layout.shelves[h.to];
    if (!L) return;
    const k = clamp01((now - h.start) / 300);
    const pulse = 0.55 + 0.45 * Math.sin((now - h.start) / 230);
    const { x, y, w, h: hh } = L.rect;
    ctx.save();
    ctx.globalAlpha = k * pulse;
    ctx.shadowColor = '#ffe9a8';
    ctx.shadowBlur = layout.cell * 0.4;
    ctx.lineWidth = Math.max(2, layout.cell * 0.06);
    ctx.strokeStyle = '#ffe2a0';
    ctx.beginPath();
    ctx.roundRect(x - 3, y - 3, w + 6, hh + 6, layout.cell * 0.26);
    ctx.stroke();
    ctx.restore();
  }

  private drawBadge(ctx: CanvasRenderingContext2D, L: ShelfLayout, cell: number, n: number): void {
    const r = cell * 0.17;
    const x = L.rect.x + L.rect.w - r * 1.1;
    const y = L.rect.y + r * 1.1;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(12,6,26,0.7)';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,225,170,0.5)';
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,236,200,0.9)';
    ctx.font = `600 ${Math.round(r * 1.15)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`+${n}`, x, y + 0.5);
  }

  /** Occasional sparkle on a stone. */
  private twinkle(ctx: CanvasRenderingContext2D, id: number, x: number, y: number, r: number, now: number, often = false): void {
    const hh = hash(id + 17);
    const period = often ? 1600 : 3800 + (hh % 3200);
    const win = 520;
    const u = ((now + (hh % period)) % period) / win;
    if (u >= 1) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = bump(u);
    const sx = x - r * (0.3 + ((hh >> 8) % 20) / 100);
    const sy = y - r * (0.35 + ((hh >> 13) % 20) / 100);
    drawSprite(ctx, this.atlas.getGlint(), sx, sy, r * (0.35 + 0.25 * bump(u)));
    ctx.restore();
  }
}
