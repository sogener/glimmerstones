/** Progress in localStorage. Always tolerant: private mode or broken JSON must not break the game. */

const KEY = 'glimmerstones.v1';

export interface GalleryItem {
  /** How many times the picture was completed. */
  count: number;
  firstLevel: number;
  lastLevel: number;
}

export interface SaveData {
  gallery: Record<string, GalleryItem>;
}

function empty(): SaveData {
  return { gallery: {} };
}

export function load(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const data = JSON.parse(raw) as Partial<SaveData>;
    return { ...empty(), ...data, gallery: { ...(data.gallery ?? {}) } };
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

export function addToGallery(pictureId: string, level: number): GalleryItem {
  const data = load();
  const prev = data.gallery[pictureId];
  const item: GalleryItem = prev
    ? { count: prev.count + 1, firstLevel: prev.firstLevel, lastLevel: level }
    : { count: 1, firstLevel: level, lastLevel: level };
  data.gallery[pictureId] = item;
  save(data);
  return item;
}
