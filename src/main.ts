import './style.css';
import { haptics, sound } from './audio/sound.ts';
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

function refreshSettings(): void {
  const st = load().settings;
  sound.enabled = st.sound;
  haptics.enabled = st.vibration;
  const sb = $('set-sound');
  sb.innerHTML = (st.sound ? ICONS.soundOn : ICONS.soundOff) + `<span>${STR.sound}</span>`;
  sb.classList.toggle('off', !st.sound);
  const vb = $('set-vibration');
  vb.hidden = !haptics.supported;
  vb.innerHTML = ICONS.vibration + `<span>${STR.vibration}</span>`;
  vb.classList.toggle('off', !st.vibration);
  refreshSoundIcon();
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
    sound.setEnabled(on);
    refreshSettings();
    return on;
  },
  soundOn: () => load().settings.sound,
});

$('play').addEventListener('click', play);
$('open-gallery').addEventListener('click', goGallery);
setIconButton('gallery-back', ICONS.back, STR.back, goStart);
$('set-sound').addEventListener('click', () => {
  const on = !load().settings.sound;
  setSetting('sound', on);
  sound.setEnabled(on);
  refreshSettings();
  sound.button();
});
$('set-vibration').addEventListener('click', () => {
  const on = !load().settings.vibration;
  setSetting('vibration', on);
  refreshSettings();
  haptics.buzz(20);
});
refreshSettings();

// Audio may only start from a user gesture (iOS): unlock on the first touch.
const unlock = () => sound.unlock();
document.addEventListener('pointerdown', unlock, { capture: true });
document.addEventListener('touchend', unlock, { capture: true });
document.addEventListener('click', (e) => {
  if (e.target instanceof Element && e.target.closest('footer button, .big, #home, #gallery-back, .tile, .card button')) {
    sound.button();
  }
});

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
    sound,
  };
}
