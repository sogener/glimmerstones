import { describe, expect, it } from 'vitest';
import { applyMove, applyEvent, decodeBoard, encodeBoard, setCell } from './board.ts';
import { Game } from './game.ts';
import { findHint } from './hint.ts';

describe('hint', () => {
  it('suggests a legal move that keeps the level solvable', () => {
    const board = decodeBoard(['012|120', '201', '...', '...']);
    const h = findHint([board]);
    expect(h.kind).toBe('move');
    if (h.kind !== 'move') return;
    expect(h.certain).toBe(true);
    expect(applyMove(board, h.from, h.to)).not.toBeNull();
  });

  it('suggests undoing moves when the position is lost', () => {
    const lost = decodeBoard(['012', '120', '201']); // no free cell, no triple
    const alsoLost = decodeBoard(['012', '120', '201']);
    const good = decodeBoard(['012|120', '201', '...', '...']);
    expect(findHint([lost, alsoLost, good])).toEqual({ kind: 'undo', steps: 2 });
    expect(findHint([lost])).toEqual({ kind: 'none' });
  });

  it('game.undoMany stops at the start', () => {
    const g = new Game(decodeBoard(['0..', '00.']));
    expect(g.undoMany(3)).toBe(0);
  });
});

describe('animation steps', () => {
  it('replaying setCell + events reproduces applyMove', () => {
    const before = decodeBoard(['11.|23', '1..|444|5']);
    const from = { shelf: 1, cell: 0 };
    const to = { shelf: 0, cell: 2 };
    const r = applyMove(before, from, to)!;
    let b = setCell(setCell(before, from, null), to, 1);
    for (const e of r.events) b = applyEvent(b, e);
    expect(encodeBoard(b)).toEqual(encodeBoard(r.board));
  });
});
