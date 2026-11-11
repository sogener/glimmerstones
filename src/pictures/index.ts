import type { PictureData } from '../core/picture.ts';

const modules = import.meta.glob<PictureData>('./*.json', { eager: true, import: 'default' });

/** All reward pictures, sorted by id (same order as scripts/generate-levels.ts). */
export const PICTURES: PictureData[] = Object.values(modules).sort((a, b) => (a.id < b.id ? -1 : 1));

export function getPicture(id: string): PictureData | undefined {
  return PICTURES.find((p) => p.id === id);
}
