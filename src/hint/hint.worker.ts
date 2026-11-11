/// <reference lib="webworker" />
import { decodeBoard } from '../core/board.ts';
import { findHint } from '../core/hint.ts';

export interface HintRequest {
  id: number;
  boards: string[][];
  maxNodes: number;
}

self.onmessage = (e: MessageEvent<HintRequest>) => {
  const { id, boards, maxNodes } = e.data;
  const result = findHint(boards.map(decodeBoard), maxNodes);
  (self as unknown as Worker).postMessage({ id, result });
};
