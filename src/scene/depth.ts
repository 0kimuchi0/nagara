import type { Lighting, RGB } from "../palette";

/** 奥 (far) と手前 (near) の描画層。海月は 2 つの層の間に描く */
export type Layer = "far" | "near";

/** depth: 0 = いちばん奥、1 = いちばん手前。0.5 未満を奥の層とする */
export const layerOf = (depth: number): Layer => (depth < 0.5 ? "far" : "near");

export const mixRGB = (a: RGB, b: RGB, t: number): RGB => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];

/** 画面の高さ方向 yFrac (0 = 上, 1 = 下) における水の色 */
export const waterAt = (l: Lighting, yFrac: number): RGB =>
  mixRGB(l.waterTop, l.waterBottom, Math.min(1, Math.max(0, yFrac)));

/** 奥ほど水の色にかすむ割合 (0..max) */
export const hazeOf = (depth: number, max = 0.45): number => (1 - Math.min(1, Math.max(0, depth))) * max;

/** 色を、その高さの水の色へ奥行きに応じてかすませる */
export const hazed = (c: RGB, l: Lighting, yFrac: number, depth: number, max?: number): RGB =>
  mixRGB(c, waterAt(l, yFrac), hazeOf(depth, max));

/** 奥行きに応じた大きさの倍率 (奥 0.5 〜 手前 1.15) */
export const scaleOf = (depth: number): number => 0.5 + 0.65 * Math.min(1, Math.max(0, depth));
