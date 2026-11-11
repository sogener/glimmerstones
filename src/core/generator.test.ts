import { describe, expect, it } from 'vitest';
import { colorCounts, encodeBoard, stoneCount } from './board.ts';
import { fitParams, generateBoard, generateSolvable, totalStones } from './generator.ts';
import { isBreather, paramsForLevel, targetWinRate } from './levels.ts';
import { mulberry32 } from './rng.ts';
import { solve } from './solver.ts';
import { MAX_COLORS, MAX_SHELVES, MIN_SHELVES, ROW } from './types.ts';

describe('generator', () => {
  it('places every stone, keeps counts in triples and avoids ready triples', () => {
    for (let n = 1; n <= 80; n++) {
      const p = paramsForLevel(n);
      const board = generateBoard(p, mulberry32(n));
      expect(stoneCount(board)).toBe(totalStones(p));
      colorCounts(board).forEach((c, i) => expect(c).toBe(p.triples[i] * ROW));
      for (const s of board.shelves) {
        expect(s.layers.length).toBeLessThanOrEqual(p.depth);
        for (const g of [s.front, ...s.layers]) {
          const mono = g.length === ROW && g[0] !== null && g.every((x) => x === g[0]);
          expect(mono).toBe(false);
        }
        if (s.layers.length > 0) expect(s.front.some((c) => c !== null)).toBe(true);
      }
    }
  });

  it('is deterministic by level number', () => {
    const a = generateSolvable(17, paramsForLevel(17), { targetWinRate: targetWinRate(17) });
    const b = generateSolvable(17, paramsForLevel(17), { targetWinRate: targetWinRate(17) });
    expect(encodeBoard(a.board)).toEqual(encodeBoard(b.board));
    expect(a.seed).toBe(b.seed);
  });

  it('only returns boards the solver can solve', () => {
    for (const n of [1, 6, 23, 47]) {
      const g = generateSolvable(n, paramsForLevel(n));
      expect(solve(g.board).status).toBe('solved');
    }
  });

  it('fitParams grows shelves until stones fit', () => {
    const p = fitParams({ colors: 8, triples: new Array(8).fill(4), shelves: 5, depth: 1, emptyCells: 3 });
    expect(p.shelves).toBe(MAX_SHELVES);
    expect(p.shelves * ROW * (1 + p.depth) - p.emptyCells).toBeGreaterThanOrEqual(totalStones(p));
  });
});

describe('difficulty curve', () => {
  it('starts very simple: 3-4 colors, no hidden layers', () => {
    for (let n = 1; n <= 3; n++) {
      const p = paramsForLevel(n);
      expect(p.colors).toBeGreaterThanOrEqual(3);
      expect(p.colors).toBeLessThanOrEqual(4);
      expect(p.depth).toBe(0);
    }
  });

  it('stays within limits for 300 levels', () => {
    for (let n = 1; n <= 300; n++) {
      const p = paramsForLevel(n);
      expect(p.colors).toBeLessThanOrEqual(MAX_COLORS);
      expect(p.triples.length).toBe(p.colors);
      expect(p.shelves).toBeGreaterThanOrEqual(MIN_SHELVES);
      expect(p.shelves).toBeLessThanOrEqual(MAX_SHELVES);
    }
  });

  it('gets harder over time, with breathers', () => {
    expect(paramsForLevel(40).colors).toBeGreaterThan(paramsForLevel(5).colors);
    expect(isBreather(25)).toBe(true);
    expect(targetWinRate(25)).toBeGreaterThan(targetWinRate(24));
  });
});
