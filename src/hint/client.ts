import { encodeBoard } from '../core/board.ts';
import { findHint, type HintResult } from '../core/hint.ts';
import type { Board } from '../core/types.ts';

const MAX_NODES = 120_000;
const MAX_HISTORY = 60;

/** Runs the solver for hints in a Web Worker so the game never stutters. */
export class HintClient {
  private worker: Worker | null = null;
  private seq = 0;
  private pending = new Map<number, (r: HintResult) => void>();

  constructor() {
    try {
      this.worker = new Worker(new URL('./hint.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e: MessageEvent<{ id: number; result: HintResult }>) => {
        this.pending.get(e.data.id)?.(e.data.result);
        this.pending.delete(e.data.id);
      };
    } catch {
      this.worker = null;
    }
  }

  /** @param boards current board first, then earlier positions. */
  request(boards: readonly Board[]): Promise<HintResult> {
    const list = boards.slice(0, MAX_HISTORY);
    if (!this.worker) return Promise.resolve(findHint(list, MAX_NODES));
    const id = ++this.seq;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.worker!.postMessage({ id, boards: list.map(encodeBoard), maxNodes: MAX_NODES });
    });
  }
}
