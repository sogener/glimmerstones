import { describe, expect, it } from 'vitest';
import pack from '../data/levels.json';
import { colorCounts, encodeBoard, stoneCount } from './board.ts';
import { generateSolvable } from './generator.ts';
import { levelBoard, type LevelPack } from './levelpack.ts';
import { assignPictures, paramsForLevel, targetWinRate } from './levels.ts';
import { components, paletteKeys } from './picture.ts';
import { getPicture, PICTURES } from '../pictures/index.ts';
import { solve } from './solver.ts';
import { MAX_COLORS, MAX_SHELVES, MIN_SHELVES, ROW } from './types.ts';

const levels = (pack as LevelPack).levels;

describe('pre-generated level pack', () => {
  it('has at least 200 numbered levels', () => {
    expect(levels.length).toBeGreaterThanOrEqual(200);
    levels.forEach((l, i) => expect(l.n).toBe(i + 1));
  });

  it('every level is well-formed', () => {
    for (const l of levels) {
      const b = levelBoard(l);
      expect(b.shelves.length).toBeGreaterThanOrEqual(MIN_SHELVES);
      expect(b.shelves.length).toBeLessThanOrEqual(MAX_SHELVES);
      const counts = colorCounts(b);
      expect(counts.length).toBeLessThanOrEqual(MAX_COLORS);
      counts.forEach((c) => expect(c % ROW).toBe(0));
      expect(stoneCount(b)).toBeGreaterThan(0);
    }
  });

  it('first 50 levels are solvable', () => {
    for (const l of levels.slice(0, 50)) {
      expect(solve(levelBoard(l)).status, `level ${l.n}`).toBe('solved');
    }
  });

  it('every level uses its picture palette, one triple per picture piece', () => {
    for (const l of levels) {
      const pic = getPicture(l.picture);
      expect(pic, `level ${l.n} picture ${l.picture}`).toBeDefined();
      const keys = paletteKeys(pic!);
      expect(l.colors).toBe(keys.length);
      const triples = colorCounts(levelBoard(l)).map((c) => c / ROW);
      expect(triples.length).toBe(keys.length);
      const comps = components(pic!);
      triples.forEach((t, c) => expect(t).toBeGreaterThanOrEqual(comps[c].length));
    }
  });

  it('is up to date with the generator (run `npm run levels` if this fails)', () => {
    const ids = assignPictures(levels.length, PICTURES);
    levels.forEach((l, i) => expect(l.picture).toBe(ids[i]));
    for (const n of [1, 2, 3, 4, 5, 12, 31]) {
      const pic = getPicture(ids[n - 1])!;
      const g = generateSolvable(n, paramsForLevel(n, pic), { targetWinRate: targetWinRate(n), maxNodes: 150_000 });
      expect(encodeBoard(g.board)).toEqual(levels[n - 1].shelves);
    }
  });
});
