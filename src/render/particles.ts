import type { Sprite } from './gems.ts';
import { drawSprite } from './gems.ts';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: number;
  life: number;
  size: number;
  spin: number;
  sprite: Sprite;
  gravity: number;
}

/** Tiny sparkle particle system (additive glints). */
export class Particles {
  private items: Particle[] = [];

  burst(
    sprite: Sprite,
    x: number,
    y: number,
    now: number,
    opts: { count?: number; speed?: number; size?: number; life?: number; gravity?: number } = {},
  ): void {
    const count = opts.count ?? 14;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const sp = (opts.speed ?? 0.12) * (0.5 + Math.random());
      this.items.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        born: now,
        life: (opts.life ?? 650) * (0.7 + Math.random() * 0.6),
        size: (opts.size ?? 8) * (0.6 + Math.random() * 0.8),
        spin: Math.random() * Math.PI,
        sprite,
        gravity: opts.gravity ?? 0.00012,
      });
    }
  }

  get active(): boolean {
    return this.items.length > 0;
  }

  draw(ctx: CanvasRenderingContext2D, now: number): void {
    if (this.items.length === 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    this.items = this.items.filter((p) => {
      const t = now - p.born;
      if (t < 0) return true;
      if (t > p.life) return false;
      const k = t / p.life;
      const x = p.x + p.vx * t;
      const y = p.y + p.vy * t + p.gravity * t * t;
      ctx.globalAlpha = (1 - k) * (k < 0.15 ? k / 0.15 : 1);
      const s = p.size * (1 - k * 0.5);
      drawSprite(ctx, p.sprite, x, y, s * (0.8 + 0.2 * Math.sin(p.spin + t / 60)));
      return true;
    });
    ctx.restore();
  }
}
