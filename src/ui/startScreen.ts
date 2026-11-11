import { mulberry32 } from '../core/rng.ts';
import { drawSprite, GemAtlas } from '../render/gems.ts';
import { $ } from './dom.ts';
import { PHRASES, PLAYER_NAME, STR } from './strings.ts';

export interface StartInfo {
  level: number;
  hasSaved: boolean;
  collected: number;
  total: number;
}

/** Phrase of the day: changes daily, stable within a day. */
function phraseOfDay(): string {
  const d = new Date();
  const day = Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);
  return PHRASES[day % PHRASES.length];
}

export function fillStart(info: StartInfo): void {
  $('tagline').textContent = STR.subtitle;
  $('greeting').textContent = STR.greeting(PLAYER_NAME);
  $('phrase').textContent = phraseOfDay();
  $('play-label').textContent = STR.play;
  $('play-sub').textContent = info.hasSaved ? STR.continueLevel(info.level) : STR.playLevel(info.level);
  $('gallery-label').textContent = STR.gallery;
  $('gallery-sub').textContent = info.collected > 0 ? STR.galleryCount(info.collected, info.total) : STR.galleryEmpty;
}

interface Floater {
  c: number;
  x: number;
  y: number;
  r: number;
  speed: number;
  sway: number;
  phase: number;
  alpha: number;
}

/** Slowly rising gems behind the start menu. */
export class FloatingGems {
  private atlas = new GemAtlas();
  private ctx: CanvasRenderingContext2D;
  private items: Floater[] = [];
  private w = 0;
  private h = 0;
  private running = false;
  private last = 0;
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.resize();
    this.last = performance.now();
    requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
  }

  private resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = this.canvas.clientWidth;
    this.h = this.canvas.clientHeight;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.atlas.setDpr(dpr);
    const rng = mulberry32(7);
    const n = Math.round((this.w * this.h) / 26000) + 6;
    this.items = Array.from({ length: n }, () => ({
      c: Math.floor(rng() * 8),
      x: rng() * this.w,
      y: rng() * this.h,
      r: 8 + rng() * 16,
      speed: 6 + rng() * 10,
      sway: 6 + rng() * 14,
      phase: rng() * Math.PI * 2,
      alpha: 0.25 + rng() * 0.35,
    }));
  }

  private tick = (t: number): void => {
    if (!this.running) return;
    if (this.canvas.clientWidth !== this.w || this.canvas.clientHeight !== this.h) this.resize();
    const dt = Math.min(0.05, (t - this.last) / 1000);
    this.last = t;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);
    for (const f of this.items) {
      f.y -= f.speed * dt;
      if (f.y < -30) {
        f.y = this.h + 30;
        f.x = Math.random() * this.w;
      }
      const x = f.x + Math.sin(t / 1800 + f.phase) * f.sway;
      ctx.globalAlpha = f.alpha;
      drawSprite(ctx, this.atlas.get(f.c, 24), x, f.y, f.r);
      const tw = Math.sin(t / 700 + f.phase * 3);
      if (tw > 0.93) {
        ctx.globalAlpha = (tw - 0.93) * 12 * f.alpha;
        drawSprite(ctx, this.atlas.getGlint(), x - f.r * 0.35, f.y - f.r * 0.4, f.r * 0.6);
      }
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(this.tick);
  };
}
