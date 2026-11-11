import { describe, expect, it } from 'vitest';
import { PICTURES } from '../pictures/index.ts';
import {
  cellColors,
  cellCounts,
  components,
  distributeTriples,
  paletteKeys,
  partition,
  validatePicture,
  type PictureData,
} from './picture.ts';

function isConnected(cells: number[], w: number): boolean {
  const set = new Set(cells);
  const seen = new Set([cells[0]]);
  const stack = [cells[0]];
  while (stack.length) {
    const a = stack.pop()!;
    const x = a % w;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        if (nx < 0 || nx >= w) continue;
        const b = a + dy * w + dx;
        if (set.has(b) && !seen.has(b)) {
          seen.add(b);
          stack.push(b);
        }
      }
  }
  return seen.size === cells.length;
}

const tiny: PictureData = {
  id: 'tiny',
  name: 'Тест',
  width: 8,
  height: 8,
  palette: { a: '#ff0000', b: '#00ff00' },
  rows: ['aaaa....', 'aaaa....', 'aaaa..b.', '......b.', '.b......', '........', 'aaaaaaaa', 'aaaaaaaa'],
};

describe('pictures', () => {
  it('ships 10-15 valid pictures', () => {
    expect(PICTURES.length).toBeGreaterThanOrEqual(10);
    expect(PICTURES.length).toBeLessThanOrEqual(15);
    for (const p of PICTURES) expect(validatePicture(p), p.id).toEqual([]);
  });

  it('validation catches mistakes', () => {
    expect(validatePicture({ ...tiny, rows: tiny.rows.slice(1) }).length).toBeGreaterThan(0);
    expect(validatePicture({ ...tiny, rows: tiny.rows.map((r) => r.replace('b', 'z')) }).length).toBeGreaterThan(0);
    expect(validatePicture({ ...tiny, palette: { ...tiny.palette, c: '#000000' } })).toContain('color "c" is unused');
  });

  it('finds 8-connected components per color', () => {
    expect(components(tiny).map((c) => c.length)).toEqual([2, 2]);
    expect(cellCounts(tiny)).toEqual([28, 3]);
  });

  it('gives every component at least one triple, the rest by area', () => {
    expect(distributeTriples(tiny, 2)).toEqual([2, 2]); // minimum = components
    const t = distributeTriples(tiny, 9);
    expect(t.reduce((a, b) => a + b, 0)).toBe(9);
    expect(t[0]).toBeGreaterThan(t[1]);
  });

  it('cuts every picture into connected pieces that cover each color exactly', () => {
    for (const p of PICTURES) {
      for (const total of [3, 8, 16, 26]) {
        const triples = distributeTriples(p, total);
        const pieces = partition(p, triples);
        const colors = cellColors(p);
        pieces.forEach((list, c) => {
          expect(list.length, `${p.id} color ${c}`).toBe(triples[c]);
          const all = list.flatMap((pc) => pc.cells).sort((a, b) => a - b);
          const expected = colors.map((v, i) => (v === c ? i : -1)).filter((i) => i >= 0);
          expect(all).toEqual(expected);
          for (const pc of list) {
            expect(pc.cells.length).toBeGreaterThan(0);
            expect(isConnected(pc.cells, p.width), `${p.id} piece of ${paletteKeys(p)[c]}`).toBe(true);
          }
        });
      }
    }
  });

  it('orders pieces bottom first', () => {
    const pieces = partition(tiny, [3, 2])[0];
    for (let i = 1; i < pieces.length; i++) expect(pieces[i - 1].cy).toBeGreaterThanOrEqual(pieces[i].cy);
  });
});
