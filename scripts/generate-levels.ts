/**
 * Build-time level generation: runs generator + solver and writes src/data/levels.json.
 * Deterministic, so the output only changes when the generator changes.
 * Usage: node scripts/generate-levels.ts [count]
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { encodeBoard } from '../src/core/board.ts';
import { generateSolvable } from '../src/core/generator.ts';
import type { LevelPack } from '../src/core/levelpack.ts';
import { paramsForLevel, targetWinRate } from '../src/core/levels.ts';

export const LEVEL_COUNT = 240;
export const BUILD_MAX_NODES = 150_000;

const count = Number(process.argv[2]) || LEVEL_COUNT;
const out = fileURLToPath(new URL('../src/data/levels.json', import.meta.url));
const pack: LevelPack = { version: 1, levels: [] };
const t0 = performance.now();
let retries = 0;

for (let n = 1; n <= count; n++) {
  const g = generateSolvable(n, paramsForLevel(n), {
    maxNodes: BUILD_MAX_NODES,
    targetWinRate: targetWinRate(n),
  });
  retries += g.attempt;
  pack.levels.push({
    n,
    seed: g.seed,
    colors: g.params.colors,
    shelves: encodeBoard(g.board),
    solution: g.solution,
    winRate: Math.round(g.winRate * 100) / 100,
  });
  if (n % 20 === 0 || n <= 5) {
    const p = g.params;
    console.log(
      `#${n}: ${p.colors} colors, ${p.triples.reduce((a, b) => a + b, 0)} triples, ` +
        `${p.shelves} shelves, depth ${p.depth}, empty ${p.emptyCells} | ` +
        `attempt ${g.attempt}, solution ${g.solution}, nodes ${g.nodes}, ` +
        `win ${g.winRate.toFixed(2)} (target ${targetWinRate(n).toFixed(2)})`,
    );
  }
}

// One level per line keeps diffs readable.
const body = pack.levels.map((l) => '    ' + JSON.stringify(l)).join(',\n');
writeFileSync(out, `{\n  "version": ${pack.version},\n  "levels": [\n${body}\n  ]\n}\n`);
console.log(
  `Wrote ${count} levels to src/data/levels.json in ${((performance.now() - t0) / 1000).toFixed(1)}s ` +
    `(${retries} retries)`,
);
