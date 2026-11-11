import type { Board, CellRef } from '../core/types.ts';
import type { Layout } from '../render/layout.ts';
import { hitShelf, hitStone, nearestFreeCell } from './pointer.ts';

export interface InputHost {
  board(): Board;
  layout(): Layout;
  blocked(): boolean;
  selected(): CellRef | null;
  select(ref: CellRef | null): void;
  dragStart(from: CellRef, x: number, y: number): void;
  dragMove(x: number, y: number): void;
  /** Drop at (x, y); `to` is null when there is no valid target. */
  dragEnd(from: CellRef, to: CellRef | null, x: number, y: number): void;
  move(from: CellRef, to: CellRef): void;
}

const DRAG_START_PX = 9;

interface Press {
  id: number;
  x0: number;
  y0: number;
  stone: CellRef | null;
  wasSelected: boolean;
  dragging: boolean;
}

const same = (a: CellRef | null, b: CellRef | null) => !!a && !!b && a.shelf === b.shelf && a.cell === b.cell;

/**
 * Tap: stone → select (tap again to drop the selection); then tap a shelf → move.
 * Drag: press a stone and move the finger; release over a shelf with a free cell.
 */
export class InputController {
  private press: Press | null = null;
  private el: HTMLElement;
  private host: InputHost;

  constructor(el: HTMLElement, host: InputHost) {
    this.el = el;
    this.host = host;
    el.addEventListener('pointerdown', (e) => this.down(e));
    el.addEventListener('pointermove', (e) => this.moveEv(e));
    el.addEventListener('pointerup', (e) => this.up(e));
    el.addEventListener('pointercancel', (e) => this.cancel(e));
  }

  /** The dragged stone floats above the finger so it stays visible. */
  dragOffset(): number {
    return this.host.layout().cell * 0.55;
  }

  private pos(e: PointerEvent): [number, number] {
    const r = this.el.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  private down(e: PointerEvent): void {
    e.preventDefault();
    if (this.press || this.host.blocked()) return;
    const [x, y] = this.pos(e);
    const stone = hitStone(this.host.board(), this.host.layout(), x, y);
    const wasSelected = same(stone, this.host.selected());
    if (stone && !wasSelected) this.host.select(stone);
    this.press = { id: e.pointerId, x0: x, y0: y, stone, wasSelected, dragging: false };
    this.el.setPointerCapture?.(e.pointerId);
  }

  private moveEv(e: PointerEvent): void {
    const p = this.press;
    if (!p || p.id !== e.pointerId) return;
    const [x, y] = this.pos(e);
    if (!p.dragging && p.stone && Math.hypot(x - p.x0, y - p.y0) > DRAG_START_PX) {
      p.dragging = true;
      this.host.dragStart(p.stone, x, y - this.dragOffset());
    }
    if (p.dragging) this.host.dragMove(x, y - this.dragOffset());
  }

  private up(e: PointerEvent): void {
    const p = this.press;
    if (!p || p.id !== e.pointerId) return;
    this.press = null;
    const [x, y] = this.pos(e);
    const board = this.host.board();
    const layout = this.host.layout();

    if (p.dragging && p.stone) {
      const sy = y - this.dragOffset();
      const shelf = hitShelf(layout, x, sy, layout.cell * 0.6);
      const to = shelf >= 0 && shelf !== p.stone.shelf ? nearestFreeCell(board, layout, shelf, x) : null;
      this.host.dragEnd(p.stone, to, x, sy);
      return;
    }
    if (p.stone) {
      if (p.wasSelected) this.host.select(null);
      return;
    }
    const sel = this.host.selected();
    if (sel) {
      const shelf = hitShelf(layout, x, y);
      const to = shelf >= 0 && shelf !== sel.shelf ? nearestFreeCell(board, layout, shelf, x) : null;
      if (to) {
        this.host.move(sel, to);
        return;
      }
    }
    this.host.select(null);
  }

  private cancel(e: PointerEvent): void {
    const p = this.press;
    if (!p || p.id !== e.pointerId) return;
    this.press = null;
    if (p.dragging && p.stone) {
      const [x, y] = this.pos(e);
      this.host.dragEnd(p.stone, null, x, y - this.dragOffset());
    }
  }
}
