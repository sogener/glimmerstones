import { mulberry32 } from './rng.ts';
import { MAX_COLORS, ROW, type Board } from './types.ts';

/**
 * Difficulty metric: share of games won by a "casual" player who completes
 * triples when possible, likes pairing colors, otherwise plays at random.
 * 1.0 = practically impossible to get stuck, lower = more planning needed.
 * Uses flat typed arrays: it runs thousands of playouts at build time.
 */
export function casualWinRate(board: Board, playouts = 80, seed = 1): number {
  const rng = mulberry32(seed);
  const S = board.shelves.length;
  const C = MAX_COLORS;
  const initFront = new Int8Array(S * ROW);
  const initCounts = new Int16Array(S * C);
  board.shelves.forEach((s, i) =>
    s.front.forEach((c, j) => {
      initFront[i * ROW + j] = c ?? -1;
      if (c !== null) initCounts[i * C + c]++;
    }),
  );
  let initStones = 0;
  board.shelves.forEach((s) => {
    initStones += s.front.filter((c) => c !== null).length;
    s.layers.forEach((l) => (initStones += l.length));
  });

  const front = new Int8Array(S * ROW);
  const counts = new Int16Array(S * C);
  const filled = new Int8Array(S);
  const layerPos = new Int8Array(S);
  const srcCell = new Int16Array(S * ROW * S);
  const dstShelf = new Int16Array(S * ROW * S);
  const weight = new Float64Array(S * ROW * S);
  let won = 0;

  for (let k = 0; k < playouts; k++) {
    front.set(initFront);
    counts.set(initCounts);
    layerPos.fill(0);
    for (let i = 0; i < S; i++) {
      let f = 0;
      for (let j = 0; j < ROW; j++) if (front[i * ROW + j] >= 0) f++;
      filled[i] = f;
    }
    let stones = initStones;

    for (let step = 0; step < 2000; step++) {
      if (stones === 0) {
        won++;
        break;
      }
      let n = 0;
      let total = 0;
      for (let i = 0; i < S; i++) {
        for (let j = 0; j < ROW; j++) {
          const x = front[i * ROW + j];
          if (x < 0) continue;
          for (let t = 0; t < S; t++) {
            if (t === i || filled[t] >= ROW) continue;
            const same = counts[t * C + x];
            const w = same === 2 ? 60 : same === 1 ? 6 : 1;
            srcCell[n] = i * ROW + j;
            dstShelf[n] = t;
            weight[n] = w;
            total += w;
            n++;
          }
        }
      }
      if (n === 0) break; // stuck
      let r = rng() * total;
      let m = n - 1;
      for (let q = 0; q < n; q++) {
        r -= weight[q];
        if (r <= 0) {
          m = q;
          break;
        }
      }
      // Apply the move.
      const from = srcCell[m];
      const si = (from / ROW) | 0;
      const t = dstShelf[m];
      const x = front[from];
      front[from] = -1;
      counts[si * C + x]--;
      filled[si]--;
      for (let j = 0; j < ROW; j++) {
        if (front[t * ROW + j] < 0) {
          front[t * ROW + j] = x;
          break;
        }
      }
      counts[t * C + x]++;
      filled[t]++;
      for (const sh of [t, si]) {
        for (;;) {
          if (counts[sh * C + front[sh * ROW]] === ROW && front[sh * ROW] >= 0) {
            counts[sh * C + front[sh * ROW]] = 0;
            for (let j = 0; j < ROW; j++) front[sh * ROW + j] = -1;
            filled[sh] = 0;
            stones -= ROW;
            continue;
          }
          const layers = board.shelves[sh].layers;
          if (filled[sh] === 0 && layerPos[sh] < layers.length) {
            const layer = layers[layerPos[sh]++];
            for (let j = 0; j < ROW; j++) {
              const c = j < layer.length ? layer[j] : -1;
              front[sh * ROW + j] = c;
              if (c >= 0) counts[sh * C + c]++;
            }
            filled[sh] = layer.length;
            continue;
          }
          break;
        }
      }
    }
  }
  return won / playouts;
}
