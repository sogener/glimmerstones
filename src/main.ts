import './style.css';
import { Game } from './core/game.ts';
import { hintIsValid } from './core/hint.ts';
import { levelBoard } from './core/levelpack.ts';
import type { CellRef } from './core/types.ts';
import { HintClient } from './hint/client.ts';
import { InputController } from './input/controller.ts';
import { getLevel, LEVEL_COUNT } from './levelData.ts';
import { computeLayout } from './render/layout.ts';
import { BoardView } from './render/view.ts';
import { ICONS } from './ui/icons.ts';
import { STR } from './ui/strings.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('board');
const ctx = canvas.getContext('2d')!;
const field = $<HTMLElement>('field');
const overlay = $<HTMLElement>('overlay');
const card = $<HTMLElement>('card');
const toast = $<HTMLElement>('toast');
const hintBtn = $<HTMLButtonElement>('hint');

const view = new BoardView();
const hints = new HintClient();
let levelNo = 1;
let game: Game;
let cssW = 0;
let cssH = 0;
/** Bumped on every board change; stale hint answers are dropped. */
let version = 0;
let checkPending = false;
let hintBusy = false;

const now = () => performance.now();

function readLevelFromHash(): number {
  const n = Number(location.hash.replace(/\D/g, ''));
  return n >= 1 && n <= LEVEL_COUNT ? n : 1;
}

function startLevel(n: number): void {
  levelNo = Math.min(Math.max(1, n), LEVEL_COUNT);
  history.replaceState(null, '', `#${levelNo}`);
  game = new Game(levelBoard(getLevel(levelNo)));
  hideOverlay();
  resetView(false);
}

/** Shows the logic board as is (after undo, restart, new level). */
function resetView(animateLayout: boolean): void {
  version++;
  view.selected = null;
  view.drag = null;
  view.hint = null;
  view.setBoard(game.board);
  view.setLayout(computeLayout(game.board.shelves.length, cssW, cssH), now(), animateLayout);
  updateHud();
}

function resize(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  cssW = field.clientWidth;
  cssH = field.clientHeight;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  view.setSize(cssW, cssH, dpr);
  if (game) view.setLayout(computeLayout(game.board.shelves.length, cssW, cssH), now());
}

function updateHud(): void {
  $('level').textContent = STR.level(levelNo);
  $<HTMLButtonElement>('undo').disabled = !game.canUndo;
  $<HTMLButtonElement>('shelf').disabled = !game.canAddShelf;
  $<HTMLButtonElement>('prev').disabled = levelNo <= 1;
  $<HTMLButtonElement>('next').disabled = levelNo >= LEVEL_COUNT;
}

// ---- Overlays & toast ----

type CardButton = [label: string, action: () => void, primary?: boolean];

function showCard(title: string, text: string, buttons: CardButton[]): void {
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
    b.addEventListener('click', () => {
      hideOverlay();
      action();
    });
    card.append(b);
  }
  overlay.hidden = false;
}

function hideOverlay(): void {
  overlay.hidden = true;
}

let toastTimer = 0;
function showToast(text: string): void {
  toast.textContent = text;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toast.hidden = true), 1800);
}

function showWin(): void {
  const last = levelNo >= LEVEL_COUNT;
  showCard(STR.winTitle, STR.winText(levelNo), [
    [last ? STR.restart : STR.next, () => startLevel(last ? 1 : levelNo + 1), true],
  ]);
}

function showStuck(): void {
  const buttons: CardButton[] = [[STR.stuckUndo, undo, true]];
  if (game.canAddShelf) buttons.push([STR.stuckShelf, addShelf]);
  buttons.push([STR.stuckRestart, restart]);
  showCard(STR.stuckTitle, STR.stuckText, buttons);
}

// ---- Actions ----

function move(from: CellRef, to: CellRef, start?: { x: number; y: number }): boolean {
  const before = game.board;
  const events = game.move(from, to);
  if (!events) return false;
  version++;
  view.selected = null;
  view.hint = null;
  view.playMove(before, from, to, events, now(), start);
  checkPending = true;
  updateHud();
  return true;
}

function undo(): void {
  view.flush();
  if (game.undo()) resetView(false);
}

function restart(): void {
  game.restart();
  resetView(false);
}

function addShelf(): void {
  view.flush();
  if (!game.addShelf()) return;
  resetView(true);
  view.appearLast(now());
}

async function hint(): Promise<void> {
  if (hintBusy || game.won || !overlay.hidden) return;
  const asked = version;
  hintBusy = true;
  hintBtn.classList.add('thinking');
  const result = await hints.request([game.board, ...game.pastBoards]);
  hintBusy = false;
  hintBtn.classList.remove('thinking');
  if (asked !== version || !hintIsValid(game.board, result)) return;

  if (result.kind === 'move') {
    view.selected = result.from;
    view.hint = { from: result.from, to: result.to.shelf, start: now() };
  } else if (result.kind === 'undo') {
    const n = result.steps;
    showCard(STR.hintLostTitle, STR.hintLostText(n), [
      [
        STR.hintLostUndo(n),
        () => {
          view.flush();
          game.undoMany(n);
          resetView(false);
          void hint();
        },
        true,
      ],
      [STR.notNow, () => {}],
    ]);
  } else if (game.stuck) {
    showStuck();
  } else {
    showToast(STR.noHint);
  }
}

// ---- Input ----

new InputController(canvas, {
  board: () => game.board,
  layout: () => view.layout,
  blocked: () => !overlay.hidden,
  selected: () => view.selected,
  select: (ref) => {
    view.selected = ref;
    if (!ref) view.hint = null;
  },
  dragStart: (from, x, y) => {
    const color = game.board.shelves[from.shelf].front[from.cell];
    if (color === null) return;
    view.selected = null;
    view.drag = { from, color, x, y };
  },
  dragMove: (x, y) => {
    if (view.drag) {
      view.drag.x = x;
      view.drag.y = y;
    }
  },
  dragEnd: (from, to, x, y) => {
    const d = view.drag;
    view.drag = null;
    if (!d) return;
    if (!(to && move(from, to, { x, y }))) view.returnStone(from, d.color, x, y, now());
    view.hint = null;
  },
  move: (from, to) => {
    move(from, to);
  },
});

const setButton = (id: string, icon: string, label: string, action: () => void) => {
  const b = $(id);
  b.querySelector('.ico')!.innerHTML = icon;
  b.querySelector('.lbl')!.textContent = label;
  b.addEventListener('click', action);
};
setButton('undo', ICONS.undo, STR.undo, undo);
setButton('restart', ICONS.restart, STR.restart, restart);
setButton('shelf', ICONS.shelf, STR.addShelf, addShelf);
setButton('hint', ICONS.hint, STR.hint, () => void hint());
$('prev').addEventListener('click', () => startLevel(levelNo - 1));
$('next').addEventListener('click', () => startLevel(levelNo + 1));

// No pinch / double-tap zoom, no page scroll.
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

new ResizeObserver(resize).observe(field);
resize();
startLevel(readLevelFromHash());

function frame(): void {
  const t = now();
  ctx.clearRect(0, 0, cssW, cssH);
  view.draw(ctx, t);
  if (checkPending && !view.busy(t)) {
    checkPending = false;
    if (game.won) setTimeout(showWin, 250);
    else if (game.stuck) setTimeout(showStuck, 200);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Dev-only handle for automated browser checks.
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__gs = { get game() { return game; }, view, startLevel };
}
