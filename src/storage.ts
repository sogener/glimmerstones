/** Progress in localStorage. Always tolerant: private mode or broken JSON must not break the game. */
import type { GameSnapshot } from './core/game.ts';

const KEY = 'glimmerstones.v1';

export interface GalleryItem {
  /** How many times the picture was completed. */
  count: number;
  firstLevel: number;
  lastLevel: number;
}

export interface Settings {
  sound: boolean;
  vibration: boolean;
}

export interface SaveData {
  /** Level to play next (1-based, unbounded). */
  level: number;
  /** Unfinished level, if any. */
  current: { level: number; snapshot: GameSnapshot } | null;
  gallery: Record<string, GalleryItem>;
  settings: Settings;
}

function empty(): SaveData {
  return { level: 1, current: null, gallery: {}, settings: { sound: true, vibration: true } };
}

export function load(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const data = JSON.parse(raw) as Partial<SaveData>;
    const base = empty();
    return {
      level: Number.isInteger(data.level) && (data.level as number) > 0 ? (data.level as number) : 1,
      current: data.current && typeof data.current.level === 'number' ? data.current : null,
      gallery: { ...(data.gallery ?? {}) },
      settings: { ...base.settings, ...(data.settings ?? {}) },
    };
  } catch {
    return empty();
  }
}

function save(data: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Storage full or unavailable: progress just isn't kept.
  }
}

function update(fn: (d: SaveData) => void): SaveData {
  const d = load();
  fn(d);
  save(d);
  return d;
}

export function addToGallery(pictureId: string, level: number): GalleryItem {
  let item!: GalleryItem;
  update((d) => {
    const prev = d.gallery[pictureId];
    item = prev
      ? { count: prev.count + 1, firstLevel: prev.firstLevel, lastLevel: level }
      : { count: 1, firstLevel: level, lastLevel: level };
    d.gallery[pictureId] = item;
  });
  return item;
}

/** A level was completed: the next one becomes current. */
export function completeLevel(level: number): void {
  update((d) => {
    d.level = Math.max(d.level, level + 1);
    d.current = null;
  });
}

export function saveCurrent(level: number, snapshot: GameSnapshot): void {
  update((d) => {
    d.current = { level, snapshot };
  });
}

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
  update((d) => {
    d.settings[key] = value;
  });
}
