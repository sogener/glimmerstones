import { describe, expect, it } from 'vitest';
import { decodeBoard, encodeBoard } from './board.ts';
import { Game } from './game.ts';

const start = () => new Game(decodeBoard(['00.|12', '0..', '12.', '...']));

describe('game', () => {
  it('plays moves and undoes them without limit', () => {
    const g = start();
    expect(g.move({ shelf: 1, cell: 0 }, { shelf: 0, cell: 2 })).toEqual([
      { type: 'triple', shelf: 0, color: 0 },
      { type: 'advance', shelf: 0, stones: [1, 2] },
    ]);
    expect(g.move({ shelf: 2, cell: 0 }, { shelf: 3, cell: 0 })).not.toBeNull();
    expect(g.moveCount).toBe(2);
    expect(g.undo()).toBe(true);
    expect(g.undo()).toBe(true);
    expect(g.undo()).toBe(false);
    expect(encodeBoard(g.board)).toEqual(['00.|12', '0..', '12.', '...']);
  });

  it('ignores illegal moves', () => {
    const g = start();
    expect(g.move({ shelf: 3, cell: 0 }, { shelf: 0, cell: 2 })).toBeNull();
    expect(g.canUndo).toBe(false);
  });

  it('adds one permanent shelf per level', () => {
    const g = start();
    g.move({ shelf: 2, cell: 0 }, { shelf: 3, cell: 0 });
    expect(g.addShelf()).toBe(true);
    expect(g.addShelf()).toBe(false);
    expect(g.board.shelves.length).toBe(5);
    g.undo();
    expect(g.board.shelves.length).toBe(5); // undo keeps the extra shelf
    expect(encodeBoard(g.board)[2]).toBe('12.');
  });

  it('restart resets the board, history and the extra shelf', () => {
    const g = start();
    g.addShelf();
    g.move({ shelf: 2, cell: 0 }, { shelf: 4, cell: 0 });
    g.restart();
    expect(g.board).toBe(g.initial);
    expect(g.canUndo).toBe(false);
    expect(g.canAddShelf).toBe(true);
  });

  it('reports win', () => {
    const g = new Game(decodeBoard(['00.', '0..']));
    g.move({ shelf: 1, cell: 0 }, { shelf: 0, cell: 2 });
    expect(g.won).toBe(true);
  });
});
