import './style.css';
import { PICTURES } from './pictures/index.ts';
import { load, setSetting } from './storage.ts';
import { $, hideOverlay, setIconButton } from './ui/dom.ts';
import { fillGallery } from './ui/galleryScreen.ts';
import { devHandle, initGame, openLevel, refreshSoundIcon, setGameActive } from './ui/gameScreen.ts';
import { ICONS } from './ui/icons.ts';
import { fillStart, FloatingGems } from './ui/startScreen.ts';
import { STR } from './ui/strings.ts';

type ScreenName = 'start' | 'game' | 'gallery';

const floating = new FloatingGems($<HTMLCanvasElement>('start-gems'));

function show(name: ScreenName): void {
  for (const s of ['start', 'game', 'gallery'] as const) $(s).hidden = s !== name;
  hideOverlay();
  setGameActive(name === 'game');
  if (name === 'start') floating.start();
  else floating.stop();
}

function goStart(): void {
  const d = load();
  const collected = PICTURES.filter((p) => d.gallery[p.id]).length;
  fillStart({
    level: d.level,
    hasSaved: d.current?.level === d.level && d.current.snapshot.history.length > 0,
    collected,
    total: PICTURES.length,
  });
  show('start');
}

function play(): void {
  const d = load();
  show('game');
  openLevel(d.level, d.current?.level === d.level ? d.current.snapshot : null);
}

function goGallery(): void {
  fillGallery(load().gallery);
  show('gallery');
}

initGame({
  home: goStart,
  gallery: goGallery,
  toggleSound: () => {
    const on = !load().settings.sound;
    setSetting('sound', on);
    return on;
  },
  soundOn: () => load().settings.sound,
});

$('play').addEventListener('click', play);
$('open-gallery').addEventListener('click', goGallery);
setIconButton('gallery-back', ICONS.back, STR.back, goStart);
refreshSoundIcon();

// No pinch / double-tap zoom, no page scroll (the gallery grid scrolls by itself).
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());
document.addEventListener(
  'touchmove',
  (e) => {
    if (!(e.target instanceof Element && e.target.closest('#gallery-grid'))) e.preventDefault();
  },
  { passive: false },
);

goStart();

if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__gs = {
    ...devHandle,
    get game() {
      return devHandle.game;
    },
    startLevel: (n: number) => {
      show('game');
      openLevel(n);
    },
    show,
  };
}
