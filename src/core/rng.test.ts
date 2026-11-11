import { describe, expect, it } from 'vitest';
import { hashSeed, mulberry32, shuffle } from './rng.ts';

describe('rng', () => {
  it('is deterministic', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 10; i++) expect(a()).toBe(b());
  });

  it('stays in [0, 1)', () => {
    const r = mulberry32(1);
    for (let i = 0; i < 1000; i++) {
      const x = r();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('hashSeed separates inputs', () => {
    expect(hashSeed('level', 1, 0)).not.toBe(hashSeed('level', 0, 1));
    expect(hashSeed('level', 12)).toBe(hashSeed('level', 12));
  });

  it('shuffle keeps elements', () => {
    expect(shuffle(mulberry32(3), [1, 2, 3, 4, 5]).sort()).toEqual([1, 2, 3, 4, 5]);
  });
});
