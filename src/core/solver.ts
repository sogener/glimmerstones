import { firstFreeCell } from './board.ts';
import { ROW, type Board, type CellRef, type Color } from './types.ts';

/**
 * DFS solver with memoized visited states and a node limit.
 * Positions inside a row do not matter, so each shelf is reduced to
 * a sorted multiset (front) + sorted hidden layers, and shelf order is ignored.
 */

interface SShelf {
  readonly f: readonly number[]; // sorted front stones
  readonly l: readonly (readonly number[])[]; // sorted hidden layers
  readonly k: string; // canonical key
}

export interface SolverMove {
  from: number;
  to: number;
  color: Color;
}

export type SolveStatus = 'solved' | 'unsolvable' | 'limit';

export interface SolveResult {
  status: SolveStatus;
  moves: SolverMove[];
  nodes: number;
}

export interface SolveOptions {
  maxNodes?: number;
}

function mk(f: readonly number[], l: readonly (readonly number[])[]): SShelf {
  let k = f.join('');
  for (const layer of l) k += '/' + layer.join('');
  return { f, l, k };
}

function fromBoard(b: Board): SShelf[] {
  return b.shelves.map((s) =>
    mk(
      s.front.filter((c): c is number => c !== null).sort((a, b) => a - b),
      s.layers.map((l) => [...l].sort((a, b) => a - b)),
    ),
  );
}

function stateKey(state: readonly SShelf[]): string {
  return state
    .map((s) => s.k)
    .sort()
    .join('|');
}

function isSolved(state: readonly SShelf[]): boolean {
  return state.every((s) => s.f.length === 0 && s.l.length === 0);
}

function settle(f: number[], l: readonly (readonly number[])[]): SShelf {
  for (;;) {
    if (f.length === ROW && f[0] === f[ROW - 1]) {
      f = [];
      continue;
    }
    if (f.length === 0 && l.length > 0) {
      f = [...l[0]];
      l = l.slice(1);
      continue;
    }
    return mk(f, l);
  }
}

function applySolverMove(state: readonly SShelf[], m: SolverMove): SShelf[] {
  const next = [...state];
  const src = state[m.from];
  const dst = state[m.to];
  const srcF = [...src.f];
  srcF.splice(srcF.indexOf(m.color), 1);
  const dstF = [...dst.f, m.color].sort((a, b) => a - b);
  next[m.from] = settle(srcF, src.l);
  next[m.to] = settle(dstF, dst.l);
  return next;
}

function countOf(arr: readonly number[], c: number): number {
  let n = 0;
  for (const x of arr) if (x === c) n++;
  return n;
}

function generateMoves(state: readonly SShelf[]): SolverMove[] {
  const scored: { m: SolverMove; score: number }[] = [];
  const seenSrc = new Set<string>();
  for (let i = 0; i < state.length; i++) {
    const s = state[i];
    if (s.f.length === 0 || seenSrc.has(s.k)) continue;
    seenSrc.add(s.k);
    let prev = -1;
    for (const c of s.f) {
      if (c === prev) continue;
      prev = c;
      const sc = countOf(s.f, c);
      const pure = sc === s.f.length && s.l.length === 0;
      const seenDst = new Set<string>();
      for (let j = 0; j < state.length; j++) {
        if (j === i) continue;
        const t = state[j];
        if (t.f.length >= ROW || seenDst.has(t.k)) continue;
        seenDst.add(t.k);
        const tc = countOf(t.f, c);
        // Moving a pure partial stack into an empty shelf just relabels it.
        if (pure && t.f.length === 0 && sc === 1) continue;
        let score = tc * 100;
        if (tc === ROW - 1) score += 1000;
        if (t.f.length > 0 && tc < t.f.length) score -= 40; // mixing colors
        if (t.f.length === 0) score -= 20;
        if (s.f.length === 1 && s.l.length > 0) score += 60; // reveals a layer
        if (sc >= 2) score -= 50; // breaks a pair
        if (pure) score -= 30;
        scored.push({ m: { from: i, to: j, color: c }, score });
      }
    }
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.map((x) => x.m);
}

export function solve(board: Board, opts: SolveOptions = {}): SolveResult {
  const maxNodes = opts.maxNodes ?? 200_000;
  const visited = new Set<string>();
  // Iterative DFS: solutions can be hundreds of moves deep.
  interface Frame {
    state: SShelf[];
    moves: SolverMove[];
    next: number;
  }
  const root = fromBoard(board);
  if (isSolved(root)) return { status: 'solved', moves: [], nodes: 0 };
  visited.add(stateKey(root));
  const stack: Frame[] = [{ state: root, moves: generateMoves(root), next: 0 }];
  let nodes = 0;

  while (stack.length > 0) {
    const top = stack[stack.length - 1];
    if (top.next >= top.moves.length) {
      stack.pop();
      continue;
    }
    const m = top.moves[top.next++];
    const state = applySolverMove(top.state, m);
    if (isSolved(state)) {
      const moves = stack.map((f) => f.moves[f.next - 1]);
      return { status: 'solved', moves, nodes };
    }
    const key = stateKey(state);
    if (visited.has(key)) continue;
    visited.add(key);
    if (++nodes > maxNodes) return { status: 'limit', moves: [], nodes };
    stack.push({ state, moves: generateMoves(state), next: 0 });
  }
  return { status: 'unsolvable', moves: [], nodes };
}

/** Converts an abstract solver move into concrete cells on the board. */
export function toCellMove(board: Board, m: SolverMove): { from: CellRef; to: CellRef } {
  const src = board.shelves[m.from];
  const dst = board.shelves[m.to];
  return {
    from: { shelf: m.from, cell: src.front.lastIndexOf(m.color) },
    to: { shelf: m.to, cell: firstFreeCell(dst) },
  };
}

/** The move the solver would try first (used when the search runs out of budget). */
export function firstMoveGuess(board: Board): SolverMove | null {
  return generateMoves(fromBoard(board))[0] ?? null;
}
