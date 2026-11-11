import { addEmptyShelf, applyMove, isStuck, isWon, type BoardEvent } from './board.ts';
import type { Board, CellRef } from './types.ts';

/** One play session of a level: current board, unlimited undo, one extra shelf. */
export class Game {
  readonly initial: Board;
  board: Board;
  extraShelfUsed = false;
  private history: Board[] = [];

  constructor(initial: Board) {
    this.initial = initial;
    this.board = initial;
  }

  get canUndo(): boolean {
    return this.history.length > 0;
  }

  get moveCount(): number {
    return this.history.length;
  }

  get won(): boolean {
    return isWon(this.board);
  }

  get stuck(): boolean {
    return isStuck(this.board);
  }

  get canAddShelf(): boolean {
    return !this.extraShelfUsed;
  }

  /** Returns events of the move, or null if the move is illegal. */
  move(from: CellRef, to: CellRef): BoardEvent[] | null {
    const result = applyMove(this.board, from, to);
    if (!result) return null;
    this.history.push(this.board);
    this.board = result.board;
    return result.events;
  }

  undo(): boolean {
    const prev = this.history.pop();
    if (!prev) return false;
    this.board = prev;
    return true;
  }

  /** The extra shelf is permanent: it is added to every snapshot so undo keeps it. */
  addShelf(): boolean {
    if (this.extraShelfUsed) return false;
    this.extraShelfUsed = true;
    this.board = addEmptyShelf(this.board);
    this.history = this.history.map(addEmptyShelf);
    return true;
  }

  restart(): void {
    this.board = this.initial;
    this.history = [];
    this.extraShelfUsed = false;
  }
}
