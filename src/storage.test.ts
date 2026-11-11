import { beforeEach, describe, expect, it } from 'vitest';
import { addToGallery, completeLevel, load, saveCurrent, setSetting } from './storage.ts';

class MemoryStorage {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
}

beforeEach(() => {
  (globalThis as unknown as { localStorage: MemoryStorage }).localStorage = new MemoryStorage();
});

describe('storage', () => {
  it('starts with defaults', () => {
    expect(load()).toEqual({ level: 1, current: null, gallery: {}, settings: { sound: true, vibration: true } });
  });

  it('keeps progress, the unfinished level and settings', () => {
    saveCurrent(3, { board: ['0..'], history: [], extraShelfUsed: false });
    expect(load().current?.level).toBe(3);
    completeLevel(3);
    expect(load().level).toBe(4);
    expect(load().current).toBeNull();
    setSetting('sound', false);
    expect(load().settings.sound).toBe(false);
  });

  it('counts pictures in the gallery', () => {
    addToGallery('cat', 5);
    const item = addToGallery('cat', 9);
    expect(item).toEqual({ count: 2, firstLevel: 5, lastLevel: 9 });
  });

  it('survives broken or missing storage', () => {
    localStorage.setItem('glimmerstones.v1', '{not json');
    expect(load().level).toBe(1);
    (globalThis as unknown as { localStorage: unknown }).localStorage = undefined;
    expect(load().level).toBe(1);
    expect(() => completeLevel(1)).not.toThrow();
  });
});
