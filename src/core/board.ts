import { ROW, type Board, type Cell, type CellRef, type Color, type Shelf } from './types.ts';

export type BoardEvent =
  /** A full front row of one color merged and vanished. */
  | { type: 'triple'; shelf: number; color: Color }
  /** The next hidden layer slid forward into an empty front row. */
  | { type: 'advance'; shelf: number; stones: readonly Color[] };

export interface MoveResult {
  board: Board;
  events: BoardEvent[];
}

export function makeShelf(front: readonly Cell[] = [], layers: readonly (readonly Color[])[] = []): Shelf {
  const f: Cell[] = [];
  for (let i = 0; i < ROW; i++) f.push(front[i] ?? null);
  return { front: f, layers: layers.map((l) => [...l]) };
}

export function emptyShelf(): Shelf {
  return makeShelf();
}

export function isShelfEmpty(s: Shelf): boolean {
  return s.layers.length === 0 && s.front.every((c) => c === null);
}

export function isWon(b: Board): boolean {
  return b.shelves.every(isShelfEmpty);
}

export function freeCellCount(b: Board): number {
  let n = 0;
  for (const s of b.shelves) for (const c of s.front) if (c === null) n++;
  return n;
}

/** No free cell anywhere and stones remain: no move is possible. */
export function isStuck(b: Board): boolean {
  return !isWon(b) && freeCellCount(b) === 0;
}

export function firstFreeCell(s: Shelf): number {
  return s.front.indexOf(null);
}

export function stoneCount(b: Board): number {
  let n = 0;
  for (const s of b.shelves) {
    for (const c of s.front) if (c !== null) n++;
    for (const l of s.layers) n += l.length;
  }
  return n;
}

/** Number of stones of each color on the board (index = color). */
export function colorCounts(b: Board): number[] {
  const counts: number[] = [];
  const add = (c: Color) => (counts[c] = (counts[c] ?? 0) + 1);
  for (const s of b.shelves) {
    for (const c of s.front) if (c !== null) add(c);
    for (const l of s.layers) l.forEach(add);
  }
  for (let i = 0; i < counts.length; i++) counts[i] ??= 0;
  return counts;
}

export function canMove(b: Board, from: CellRef, to: CellRef): boolean {
  if (from.shelf === to.shelf) return false;
  const src = b.shelves[from.shelf];
  const dst = b.shelves[to.shelf];
  if (!src || !dst) return false;
  if (from.cell < 0 || from.cell >= ROW || to.cell < 0 || to.cell >= ROW) return false;
  return src.front[from.cell] !== null && dst.front[to.cell] === null;
}

/** Clears triples and pulls hidden layers forward until the shelf is stable. */
export function settleShelf(s: Shelf, index: number, events: BoardEvent[]): Shelf {
  let front = [...s.front];
  let layers = s.layers;
  let changed = false;
  for (;;) {
    const first = front[0];
    if (first !== null && front.every((c) => c === first)) {
      events.push({ type: 'triple', shelf: index, color: first });
      front = front.map(() => null);
      changed = true;
      continue;
    }
    if (front.every((c) => c === null) && layers.length > 0) {
      const [next, ...rest] = layers;
      events.push({ type: 'advance', shelf: index, stones: [...next] });
      front = Array.from({ length: ROW }, (_, i) => next[i] ?? null);
      layers = rest;
      changed = true;
      continue;
    }
    break;
  }
  return changed ? { front, layers } : s;
}

export function settleBoard(b: Board): Board {
  const events: BoardEvent[] = [];
  return { shelves: b.shelves.map((s, i) => settleShelf(s, i, events)) };
}

/** Moves one front stone into a free front cell of another shelf. Returns null if illegal. */
export function applyMove(b: Board, from: CellRef, to: CellRef): MoveResult | null {
  if (!canMove(b, from, to)) return null;
  const shelves = [...b.shelves];
  const src = shelves[from.shelf];
  const dst = shelves[to.shelf];
  const stone = src.front[from.cell] as Color;

  const srcFront = [...src.front];
  srcFront[from.cell] = null;
  const dstFront = [...dst.front];
  dstFront[to.cell] = stone;

  const events: BoardEvent[] = [];
  shelves[to.shelf] = settleShelf({ front: dstFront, layers: dst.layers }, to.shelf, events);
  shelves[from.shelf] = settleShelf({ front: srcFront, layers: src.layers }, from.shelf, events);
  return { board: { shelves }, events };
}

export function addEmptyShelf(b: Board): Board {
  return { shelves: [...b.shelves, emptyShelf()] };
}

// ---- Compact text encoding: "01.|234|56" = front "01_", then hidden layers. ----

export function encodeShelf(s: Shelf): string {
  const front = s.front.map((c) => (c === null ? '.' : String(c))).join('');
  return [front, ...s.layers.map((l) => l.join(''))].join('|');
}

function decodeColor(ch: string): Color {
  if (!/^[0-7]$/.test(ch)) throw new Error(`Bad stone "${ch}"`);
  return Number(ch);
}

export function decodeShelf(text: string): Shelf {
  const [front, ...layers] = text.split('|');
  const cells: Cell[] = [...front].map((ch) => (ch === '.' ? null : decodeColor(ch)));
  return makeShelf(
    cells,
    layers.filter((l) => l.length > 0).map((l) => [...l].map(decodeColor)),
  );
}

export function encodeBoard(b: Board): string[] {
  return b.shelves.map(encodeShelf);
}

export function decodeBoard(shelves: readonly string[]): Board {
  return { shelves: shelves.map(decodeShelf) };
}
