import { PICTURES } from '../pictures/index.ts';
import { renderPictureThumbnail } from '../render/picture.ts';
import type { PictureData } from '../core/picture.ts';
import type { GalleryItem } from '../storage.ts';
import { $, showCard } from './dom.ts';
import { STR } from './strings.ts';

function thumb(pic: PictureData, px: number): HTMLCanvasElement {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cell = px / Math.max(pic.width, pic.height);
  return renderPictureThumbnail(pic, cell, dpr);
}

function openPicture(pic: PictureData, item: GalleryItem): void {
  const big = thumb(pic, 240);
  big.className = 'big-pic';
  const text = `${STR.timesCollected(item.count)}, ${STR.firstOnLevel(item.firstLevel)}`;
  showCard(pic.name, text, [[STR.close, () => {}, true]], { media: big });
}

/** Fills the gallery grid: collected pictures as pebble mosaics, the rest as "?" tiles. */
export function fillGallery(gallery: Record<string, GalleryItem>): void {
  const grid = $('gallery-grid');
  grid.replaceChildren();
  const collected = PICTURES.filter((p) => gallery[p.id]);
  $('gallery-title').textContent = STR.gallery;
  $('gallery-count').textContent = STR.galleryCount(collected.length, PICTURES.length);

  // Collected first (in the order they were found), then the locked ones.
  const order = [...PICTURES].sort((a, b) => {
    const ga = gallery[a.id];
    const gb = gallery[b.id];
    if (ga && gb) return ga.firstLevel - gb.firstLevel;
    return ga ? -1 : gb ? 1 : 0;
  });
  for (const pic of order) {
    const item = gallery[pic.id];
    const tile = document.createElement('button');
    tile.className = 'tile' + (item ? '' : ' locked');
    if (item) {
      tile.append(thumb(pic, 96));
      const name = document.createElement('div');
      name.className = 'tname';
      name.textContent = pic.name;
      tile.append(name);
      if (item.count > 1) {
        const badge = document.createElement('div');
        badge.className = 'badge';
        badge.textContent = `×${item.count}`;
        tile.append(badge);
      }
      tile.addEventListener('click', () => openPicture(pic, item));
    } else {
      const q = document.createElement('div');
      q.className = 'q';
      q.textContent = '?';
      const name = document.createElement('div');
      name.className = 'tname';
      name.textContent = STR.notCollected;
      tile.append(q, name);
      tile.disabled = true;
    }
    grid.append(tile);
  }
}
