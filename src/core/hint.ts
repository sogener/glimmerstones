import { firstFreeCell } from './board.ts';
import { firstMoveGuess, solve, toCellMove } from './solver.ts';
import type { Board, CellRef } from './types.ts';

export type HintResult =
  /** A good move. `certain` is false when the solver ran out of budget and guessed. */
  | { kind: 'move'; from: CellRef; to: CellRef; certain: boolean }
  /** The current position cannot be solved; undoing `steps` moves gets back on track. */
  | { kind: 'undo'; steps: number }
  | { kind: 'none' };

/**
 * @param boards current board first, then earlier positions (most recent first).
 */
export function findHint(boards: readonly Board[], maxNodes = 150_000): HintResult {
  const current = boards[0];
  if (!current) return { kind: 'none' };
  const res = solve(current, { maxNodes });
  if (res.status === 'solved' && res.moves.length > 0) {
    return { kind: 'move', ...toCellMove(current, res.moves[0]), certain: true };
  }
  if (res.status === 'limit') {
    const guess = firstMoveGuess(current);
    return guess ? { kind: 'move', ...toCellMove(current, guess), certain: false } : { kind: 'none' };
  }
  if (res.status === 'unsolvable') {
    for (let k = 1; k < boards.length; k++) {
      if (solve(boards[k], { maxNodes }).status !== 'unsolvable') return { kind: 'undo', steps: k };
    }
  }
  return { kind: 'none' };
}

/** True when the move targets a real free cell (sanity check for UI). */
export function hintIsValid(board: Board, h: HintResult): boolean {
  if (h.kind !== 'move') return true;
  const src = board.shelves[h.from.shelf];
  const dst = board.shelves[h.to.shelf];
  return !!src && !!dst && src.front[h.from.cell] !== null && firstFreeCell(dst) >= 0;
}
