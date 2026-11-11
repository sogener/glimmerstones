import { describe, expect, it } from 'vitest';
import { applyMove, decodeBoard, isWon } from './board.ts';
import { solve, toCellMove } from './solver.ts';
import type { Board } from './types.ts';

function replay(board: Board, moves: ReturnType<typeof solve>['moves']): Board {
  let b = board;
  for (const m of moves) {
    const { from, to } = toCellMove(b, m);
    const r = applyMove(b, from, to);
    expect(r).not.toBeNull();
    b = r!.board;
  }
  return b;
}

describe('solver', () => {
  it('solves a small board and the solution replays to a win', () => {
    const board = decodeBoard(['012|120', '201', '...', '...']);
    const res = solve(board);
    expect(res.status).toBe('solved');
    expect(isWon(replay(board, res.moves))).toBe(true);
  });

  it('reports already solved boards', () => {
    expect(solve(decodeBoard(['...'])).status).toBe('solved');
  });

  it('proves a jammed board unsolvable', () => {
    expect(solve(decodeBoard(['012', '120', '201'])).status).toBe('unsolvable');
  });

  it('respects the node limit', () => {
    const board = decodeBoard(['012|345|670', '123|456|701', '234|567|012', '345|670|123', '...', '...']);
    const res = solve(board, { maxNodes: 5 });
    expect(res.status).toBe('limit');
    expect(res.nodes).toBeLessThanOrEqual(6);
  });
});
