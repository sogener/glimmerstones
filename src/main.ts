import './style.css';
import { Game } from './core/game.ts';
import { levelBoard } from './core/levelpack.ts';
import type { CellRef } from './core/types.ts';
import { hitStone, hitTarget } from './input/pointer.ts';
import { getLevel, LEVEL_COUNT } from './levelData.ts';
import { computeLayout, type Layout } from './render/layout.ts';
import { drawScene } from './render/scene.ts';
import { STR } from './ui/strings.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('board');
const ctx = canvas.getContext('2d')!;
const field = $<HTMLElement>('field');
const overlay = $<HTMLElement>('overlay');
const card = $<HTMLElement>('card');

let levelNo = 1;
let game: Game;
let layout: Layout;
let selected: CellRef | null = null;
let cssW = 0;
let cssH = 0;
let dirty = true;

function readLevelFromHash(): number {
  const n = Number(location.hash.replace(/\D/g, ''));
  return n >= 1 && n <= LEVEL_COUNT ? n : 1;
}

function startLevel(n: number): void {
  levelNo = Math.min(Math.max(1, n), LEVEL_COUNT);
  history.replaceState(null, '', `#${levelNo}`);
  game = new Game(levelBoard(getLevel(levelNo)));
  selected = null;
  hideOverlay();
  relayout();
  updateHud();
}

function relayout(): void {
  layout = computeLayout(game.board.shelves.length, cssW, cssH);
  dirty = true;
}

function resize(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  cssW = field.clientWidth;
  cssH = field.clientHeight;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (game) relayout();
}

function updateHud(): void {
  $('level').textContent = STR.level(levelNo);
  $<HTMLButtonElement>('undo').disabled = !game.canUndo;
  $<HTMLButtonElement>('shelf').disabled = !game.canAddShelf;
  $<HTMLButtonElement>('prev').disabled = levelNo <= 1;
  $<HTMLButtonElement>('next').disabled = levelNo >= LEVEL_COUNT;
}

function afterChange(): void {
  dirty = true;
  updateHud();
  if (game.won) showWin();
  else if (game.stuck) showStuck();
}

// ---- Overlays ----

function showCard(title: string, text: string, buttons: [string, () => void, boolean?][]): void {
  card.replaceChildren();
  const h = document.createElement('h2');
  h.textContent = title;
  const p = document.createElement('p');
  p.textContent = text;
  card.append(h, p);
  for (const [label, action, primary] of buttons) {
    const b = document.createElement('button');
    b.textContent = label;
    if (primary) b.className = 'primary';
    b.addEventListener('click', action);
    card.append(b);
  }
  overlay.hidden = false;
}

function hideOverlay(): void {
  overlay.hidden = true;
}

function showWin(): void {
  const last = levelNo >= LEVEL_COUNT;
  showCard(STR.winTitle, STR.winText(levelNo), [
    [last ? STR.restart : STR.next, () => startLevel(last ? 1 : levelNo + 1), true],
  ]);
}

function showStuck(): void {
  const buttons: [string, () => void, boolean?][] = [[STR.stuckUndo, () => (hideOverlay(), undo()), true]];
  if (game.canAddShelf) buttons.push([STR.stuckShelf, () => (hideOverlay(), addShelf())]);
  buttons.push([STR.stuckRestart, () => (hideOverlay(), restart())]);
  showCard(STR.stuckTitle, STR.stuckText, buttons);
}

// ---- Actions ----

function undo(): void {
  selected = null;
  if (game.undo()) afterChange();
}

function restart(): void {
  selected = null;
  game.restart();
  relayout();
  afterChange();
}

function addShelf(): void {
  selected = null;
  if (game.addShelf()) {
    relayout();
    afterChange();
  }
}

function onTap(x: number, y: number): void {
  if (!overlay.hidden) return;
  const stone = hitStone(game.board, layout, x, y);
  if (stone) {
    const same = selected && selected.shelf === stone.shelf && selected.cell === stone.cell;
    selected = same ? null : stone;
    dirty = true;
    return;
  }
  if (selected) {
    const target = hitTarget(game.board, layout, x, y);
    if (target && target.shelf !== selected.shelf && game.move(selected, target)) {
      selected = null;
      afterChange();
      return;
    }
  }
  selected = null;
  dirty = true;
}

canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  const r = canvas.getBoundingClientRect();
  onTap(e.clientX - r.left, e.clientY - r.top);
});

$('undo').addEventListener('click', undo);
$('restart').addEventListener('click', restart);
$('shelf').addEventListener('click', addShelf);
$('prev').addEventListener('click', () => startLevel(levelNo - 1));
$('next').addEventListener('click', () => startLevel(levelNo + 1));
$('undo').querySelector('.lbl')!.textContent = STR.undo;
$('restart').querySelector('.lbl')!.textContent = STR.restart;
$('shelf').querySelector('.lbl')!.textContent = STR.addShelf;

// No pinch / double-tap zoom, no page scroll.
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

new ResizeObserver(resize).observe(field);
resize();
startLevel(readLevelFromHash());

function frame(t: number): void {
  if (dirty || selected) {
    drawScene(ctx, cssW, cssH, { board: game.board, layout, selected, time: t });
    dirty = false;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
