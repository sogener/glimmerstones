import { describe, expect, it } from 'vitest';
import { PICTURES } from '../pictures/index.ts';
import { paletteKeys } from '../core/picture.ts';
import { gemStylesForPalette } from './gems.ts';

function lightness(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  return (Math.max(...c) + Math.min(...c)) / 2;
}

describe('gem colors from picture palettes', () => {
  it('keep every gem readable and give each color its own cut', () => {
    for (const p of PICTURES) {
      const styles = gemStylesForPalette(paletteKeys(p).map((k) => p.palette[k]));
      expect(new Set(styles.map((s) => s.shape)).size).toBe(styles.length);
      for (const s of styles) {
        const l = lightness(s.color);
        expect(l).toBeGreaterThanOrEqual(0.3);
        expect(l).toBeLessThanOrEqual(0.86);
      }
    }
  });

  it('pushes tones of one hue apart (heart: outline / fill / highlight)', () => {
    const heart = PICTURES.find((p) => p.id === 'heart')!;
    const ls = gemStylesForPalette(paletteKeys(heart).map((k) => heart.palette[k])).map((s) => lightness(s.color));
    ls.sort((a, b) => a - b);
    expect(ls[1] - ls[0]).toBeGreaterThan(0.17);
    expect(ls[2] - ls[1]).toBeGreaterThan(0.17);
  });
});
