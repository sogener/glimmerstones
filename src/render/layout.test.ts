import { describe, expect, it } from 'vitest';
import { computeLayout, lerpLayout } from './layout.ts';

const SCREENS = [
  [375, 520], // small phone, browser chrome
  [390, 660],
  [430, 760],
  [768, 900],
];

describe('layout', () => {
  it('fits every shelf count on phone screens without overlaps', () => {
    for (const [w, h] of SCREENS) {
      for (let n = 5; n <= 13; n++) {
        const L = computeLayout(n, w, h);
        expect(L.shelves.length).toBe(n);
        for (const s of L.shelves) {
          expect(s.rect.x).toBeGreaterThanOrEqual(0);
          expect(s.rect.y).toBeGreaterThanOrEqual(0);
          expect(s.rect.x + s.rect.w).toBeLessThanOrEqual(w + 0.01);
          expect(s.rect.y + s.rect.h).toBeLessThanOrEqual(h + 0.01);
        }
        for (let i = 0; i < n; i++)
          for (let j = i + 1; j < n; j++) {
            const a = L.shelves[i].rect;
            const b = L.shelves[j].rect;
            const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
            expect(overlap).toBe(false);
          }
      }
    }
  });

  it('uses one column when it makes stones clearly bigger', () => {
    const tall = computeLayout(5, 390, 760);
    expect(new Set(tall.shelves.map((s) => s.rect.x)).size).toBe(1);
    const many = computeLayout(10, 390, 760);
    expect(new Set(many.shelves.map((s) => Math.round(s.rect.x))).size).toBe(2);
  });

  it('interpolates between layouts', () => {
    const a = computeLayout(5, 390, 700);
    const b = computeLayout(6, 390, 700);
    const mid = lerpLayout(a, b, 0.5);
    expect(mid.shelves.length).toBe(6);
    expect(mid.cell).toBeCloseTo((a.cell + b.cell) / 2);
  });
});
