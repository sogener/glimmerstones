import { describe, expect, it } from 'vitest';
import {
  applyMove,
  colorCounts,
  decodeBoard,
  encodeBoard,
  freeCellCount,
  isStuck,
  isWon,
  settleBoard,
} from './board.ts';

const b = (...shelves: string[]) => decodeBoard(shelves);

describe('board', () => {
  it('encodes and decodes shelves', () => {
    const board = b('01.|234|56', '...', '7.0');
    expect(encodeBoard(board)).toEqual(['01.|234|56', '...', '7.0']);
    expect(board.shelves[0].layers).toEqual([[2, 3, 4], [5, 6]]);
  });

  it('moves a stone into a free cell', () => {
    const r = applyMove(b('01.', '2..'), { shelf: 0, cell: 1 }, { shelf: 1, cell: 2 })!;
    expect(encodeBoard(r.board)).toEqual(['0..', '2.1']);
    expect(r.events).toEqual([]);
  });

  it('rejects illegal moves', () => {
    const board = b('01.', '222|1', '...');
    expect(applyMove(board, { shelf: 0, cell: 2 }, { shelf: 2, cell: 0 })).toBeNull(); // empty source
    expect(applyMove(board, { shelf: 0, cell: 0 }, { shelf: 0, cell: 2 })).toBeNull(); // same shelf
    expect(applyMove(board, { shelf: 0, cell: 0 }, { shelf: 1, cell: 0 })).toBeNull(); // occupied
  });

  it('clears a triple and pulls the next layer forward', () => {
    const r = applyMove(b('11.|23', '1..'), { shelf: 1, cell: 0 }, { shelf: 0, cell: 2 })!;
    expect(encodeBoard(r.board)).toEqual(['23.', '...']);
    expect(r.events).toEqual([
      { type: 'triple', shelf: 0, color: 1 },
      { type: 'advance', shelf: 0, stones: [2, 3] },
    ]);
  });

  it('advances the source shelf when its front row empties', () => {
    const r = applyMove(b('.0.|445|6', '...'), { shelf: 0, cell: 1 }, { shelf: 1, cell: 0 })!;
    expect(encodeBoard(r.board)).toEqual(['445|6', '0..']);
    expect(r.events).toEqual([{ type: 'advance', shelf: 0, stones: [4, 4, 5] }]);
  });

  it('chains: an advanced layer that is a triple clears too', () => {
    const board = settleBoard(b('...|222|3'));
    expect(encodeBoard(board)).toEqual(['3..']);
  });

  it('detects win and stuck', () => {
    expect(isWon(b('...', '...'))).toBe(true);
    expect(isWon(b('...|1', '...'))).toBe(false);
    const full = b('012', '120', '201');
    expect(freeCellCount(full)).toBe(0);
    expect(isStuck(full)).toBe(true);
    expect(isStuck(b('...', '...'))).toBe(false);
  });

  it('counts colors', () => {
    expect(colorCounts(b('01.|11', '2..'))).toEqual([1, 3, 1]);
  });
});

describe('board decoding', () => {
  it('rejects garbage', () => {
    expect(() => decodeBoard(['01.|..'])).toThrow();
    expect(() => decodeBoard(['09.'])).toThrow();
  });
});
