import { colorCounts } from '../core/board.ts';
import { Game, type GameSnapshot } from '../core/game.ts';
import { hintIsValid } from '../core/hint.ts';
import { levelBoard } from '../core/levelpack.ts';
import { paletteKeys } from '../core/picture.ts';
import type { CellRef } from '../core/types.ts';
import { HintClient } from '../hint/client.ts';
import { InputController } from '../input/controller.ts';
import { getLevel } from '../levelData.ts';
import { getPicture } from '../pictures/index.ts';
import { gemStylesForPalette } from '../render/gems.ts';
import { splitField, type Rect } from '../render/layout.ts';
import { PictureView } from '../render/picture.ts';
import { BoardView } from '../render/view.ts';
import { addToGallery, completeLevel, saveCurrent } from '../storage.ts';
import { $, hideOverlay, overlayOpen, setIconButton, showCard, showToast, type CardButton } from './dom.ts';
import { ICONS } from './icons.ts';
import { STR } from './strings.ts';

export interface GameHooks {
  home(): void;
  gallery(): void;
  /** Sound toggle pressed; returns the new state. */
  toggleSound(): boolean;
  soundOn(): boolean;
}

const CELEBRATION_MS = 1900;
const now = () => performance.now();

const canvas = $<HTMLCanvasElement>('board');
const ctx = canvas.getContext('2d')!;
const field = $('field');
const hintBtn = $<HTMLButtonElement>('hint');

const view = new BoardView();
const picture = new PictureView();
view.tripleSink = picture;
let hints: HintClient | null = null;
let hooks: GameHooks;

let levelNo = 1;
let game: Game | null = null;
let cssW = 0;
let cssH = 0;
let dpr = 1;
/** Bumped on every board change; stale hint answers are dropped. */
let version = 0;
let checkPending = false;
let hintBusy = false;
/** Time the win celebration started, or null. */
let celebrating: number | null = null;
let active = false;

const g = (): Game => game!;

// ---- Level lifecycle ----

/** Opens level n, continuing a saved session when it belongs to this level. */
export function openLevel(n: number, snapshot: GameSnapshot | null = null): void {
  levelNo = n;
  const level = getLevel(n);
  const initial = levelBoard(level);
  game = (snapshot && Game.restore(initial, snapshot)) || new Game(initial);
  const pic = getPicture(level.picture)!;
  const triples = colorCounts(initial).map((k) => k / 3);
  picture.setPicture(pic, triples);
  view.atlas.setStyles(gemStylesForPalette(paletteKeys(pic).map((k) => pic.palette[k])));
  hideOverlay();
  resetView(false);
}

/** Next level with a soft fade between boards. */
function goNext(): void {
  field.classList.add('leaving');
  setTimeout(() => {
    openLevel(levelNo + 1);
    field.classList.remove('leaving');
    field.classList.add('entering');
    requestAnimationFrame(() => requestAnimationFrame(() => field.classList.remove('entering')));
  }, 290);
}

function persist(): void {
  if (game && !game.won) saveCurrent(levelNo, game.snapshot());
}

function applyLayout(animate: boolean): void {
  if (!game || cssW === 0) return;
  const { picH, layout } = splitField(game.board.shelves.length, cssW, cssH);
  picture.setRect({ x: 0, y: 0, w: cssW, h: picH }, dpr);
  view.setLayout(layout, now(), animate);
}

/** Shows the logic board as is (after undo, restart, a new level). */
function resetView(animateLayout: boolean): void {
  version++;
  view.selected = null;
  view.drag = null;
  view.hint = null;
  view.setBoard(g().board);
  picture.sync(g().board);
  celebrating = null;
  view.particlesOnTop = false;
  checkPending = g().stuck;
  applyLayout(animateLayout);
  updateHud();
}

function resize(): void {
  if (field.clientWidth === 0 || field.clientHeight === 0) return;
  // DPR 2 is visually indistinguishable on phones and ~2x cheaper than 3.
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  cssW = field.clientWidth;
  cssH = field.clientHeight;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  view.setSize(cssW, cssH, dpr);
  applyLayout(false);
}

function updateHud(): void {
  $('level').textContent = STR.level(levelNo);
  $<HTMLButtonElement>('undo').disabled = !g().canUndo;
  $<HTMLButtonElement>('shelf').disabled = !g().canAddShelf;
}

export function refreshSoundIcon(): void {
  const on = hooks.soundOn();
  const b = $('sound-game');
  b.innerHTML = on ? ICONS.soundOn : ICONS.soundOff;
  b.setAttribute('aria-label', on ? STR.soundOn : STR.soundOff);
}

// ---- Win / dead end ----

/** The finished picture grows to the center, shimmers, and is saved to the gallery. */
function celebrate(): void {
  const t = now();
  celebrating = t;
  view.particlesOnTop = true;
  addToGallery(picture.pic.id, levelNo);
  completeLevel(levelNo);
  const size = Math.min(cssW * 0.86, (cssH - 230) * 0.95);
  const big: Rect = { x: (cssW - size) / 2, y: Math.max(8, (cssH - 230 - size) / 2), w: size, h: size };
  picture.celebrate(t, big);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    view.sparkle(
      big.x + big.w / 2 + Math.cos(a) * size * 0.42,
      big.y + big.h / 2 + Math.sin(a) * size * 0.42,
      t + 700 + k * 120,
    );
  }
  setTimeout(showWin, CELEBRATION_MS - 300);
}

function showWin(): void {
  if (!active) return;
  showCard(STR.winTitle, STR.winText(picture.pic.name), [
    [STR.next, goNext, true],
    [STR.toGallery, () => hooks.gallery()],
  ], { kind: 'win' });
}

function showStuck(): void {
  const buttons: CardButton[] = [[STR.stuckUndo, undo, true]];
  if (g().canAddShelf) buttons.push([STR.stuckShelf, addShelf]);
  buttons.push([STR.stuckRestart, restart]);
  showCard(STR.stuckTitle, STR.stuckText, buttons);
}

// ---- Actions ----

function move(from: CellRef, to: CellRef, start?: { x: number; y: number }): boolean {
  if (celebrating !== null) return false;
  const before = g().board;
  const events = g().move(from, to);
  if (!events) return false;
  version++;
  view.selected = null;
  view.hint = null;
  view.playMove(before, from, to, events, now(), start);
  checkPending = true;
  updateHud();
  persist();
  return true;
}

function undo(): void {
  if (celebrating !== null) return;
  view.flush();
  if (g().undo()) {
    resetView(false);
    persist();
  }
}

function restart(): void {
  if (celebrating !== null) return;
  g().restart();
  resetView(false);
  persist();
}

function addShelf(): void {
  if (celebrating !== null) return;
  view.flush();
  if (!g().addShelf()) return;
  resetView(true);
  view.appearLast(now());
  persist();
}

async function hint(): Promise<void> {
  if (hintBusy || g().won || overlayOpen() || celebrating !== null) return;
  hints ??= new HintClient();
  const asked = version;
  hintBusy = true;
  hintBtn.classList.add('thinking');
  const result = await hints.request([g().board, ...g().pastBoards]);
  hintBusy = false;
  hintBtn.classList.remove('thinking');
  if (asked !== version || !hintIsValid(g().board, result)) return;

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
          g().undoMany(n);
          resetView(false);
          persist();
          void hint();
        },
        true,
      ],
      [STR.notNow, () => {}],
    ]);
  } else if (g().stuck) {
    showStuck();
  } else {
    showToast(STR.noHint);
  }
}

// ---- Setup ----

export function initGame(h: GameHooks): void {
  hooks = h;
  new InputController(canvas, {
    board: () => g().board,
    layout: () => view.layout,
    blocked: () => overlayOpen() || celebrating !== null || !game,
    selected: () => view.selected,
    select: (ref) => {
      view.selected = ref;
      if (!ref) view.hint = null;
    },
    dragStart: (from, x, y) => {
      const color = g().board.shelves[from.shelf].front[from.cell];
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

  setIconButton('undo', ICONS.undo, STR.undo, undo);
  setIconButton('restart', ICONS.restart, STR.restart, restart);
  setIconButton('shelf', ICONS.shelf, STR.addShelf, addShelf);
  setIconButton('hint', ICONS.hint, STR.hint, () => void hint());
  setIconButton('home', ICONS.home, STR.home, () => {
    persist();
    hooks.home();
  });
  setIconButton('sound-game', ICONS.soundOn, STR.soundOn, () => {
    const on = hooks.toggleSound();
    refreshSoundIcon();
    showToast(on ? STR.soundOn : STR.soundOff);
  });
  refreshSoundIcon();

  new ResizeObserver(resize).observe(field);
  document.addEventListener('visibilitychange', () => document.hidden && persist());
  requestAnimationFrame(frame);
}

/** Pauses rendering while another screen is shown. */
export function setGameActive(on: boolean): void {
  active = on;
  if (on) resize();
}

function frame(): void {
  requestAnimationFrame(frame);
  if (!active || !game || cssW === 0) return;
  const t = now();
  ctx.clearRect(0, 0, cssW, cssH);
  if (celebrating === null) {
    picture.draw(ctx, t);
    view.draw(ctx, t);
  } else {
    // Shelves fade under a veil, the picture takes the stage.
    view.draw(ctx, t);
    ctx.fillStyle = `rgba(20,12,38,${0.8 * Math.min(1, (t - celebrating) / 500)})`;
    ctx.fillRect(0, 0, cssW, cssH);
    picture.draw(ctx, t);
    view.drawParticles(ctx, t);
  }
  if (checkPending && !view.busy(t) && !picture.busy(t)) {
    checkPending = false;
    if (game.won) setTimeout(celebrate, 150);
    else if (game.stuck) setTimeout(showStuck, 200);
  }
}

/** Dev-only handle for automated browser checks. */
export const devHandle = {
  get game() {
    return game;
  },
  view,
  picture,
  openLevel,
};
