import {
  addEmptyShelf,
  applyMove,
  colorCounts,
  decodeBoard,
  encodeBoard,
  isStuck,
  isWon,
  type BoardEvent,
} from './board.ts';
import type { Board, CellRef } from './types.ts';

/** Saved session: enough to continue a level later with full undo. */
export interface GameSnapshot {
  board: string[];
  /** Oldest first. */
  history: string[][];
  extraShelfUsed: boolean;
}

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

  /** Earlier positions, most recent first. */
  get pastBoards(): readonly Board[] {
    return [...this.history].reverse();
  }

  undoMany(steps: number): number {
    let done = 0;
    while (done < steps && this.undo()) done++;
    return done;
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

  snapshot(): GameSnapshot {
    return {
      board: encodeBoard(this.board),
      history: this.history.map(encodeBoard),
      extraShelfUsed: this.extraShelfUsed,
    };
  }

  /** Restores a saved session; returns null if it does not fit this level (e.g. levels changed). */
  static restore(initial: Board, snap: GameSnapshot): Game | null {
    try {
      const g = new Game(initial);
      const board = decodeBoard(snap.board);
      const history = snap.history.map(decodeBoard);
      const base = colorCounts(initial);
      const n0 = initial.shelves.length;
      for (const b of [board, ...history]) {
        const n = b.shelves.length;
        if (n !== n0 && n !== n0 + 1) return null;
        if (n === n0 + 1 && !snap.extraShelfUsed) return null;
        const counts = colorCounts(b);
        if (counts.length > base.length) return null;
        for (let c = 0; c < base.length; c++) {
          const left = counts[c] ?? 0;
          if (left > base[c] || (base[c] - left) % 3 !== 0) return null;
        }
      }
      g.board = board;
      g.history = history;
      g.extraShelfUsed = snap.extraShelfUsed;
      return g;
    } catch {
      return null;
    }
  }

  restart(): void {
    this.board = this.initial;
    this.history = [];
    this.extraShelfUsed = false;
  }
}
