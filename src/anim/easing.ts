export const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
export const easeInCubic = (t: number) => t * t * t;
export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
export const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;
export function easeOutBack(t: number, s = 1.6): number {
  const u = t - 1;
  return 1 + (s + 1) * u * u * u + s * u * u;
}
/** 0 → 1 → 0 bump. */
export const bump = (t: number) => Math.sin(Math.PI * clamp01(t));
