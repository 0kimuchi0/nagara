import type { RGB } from "../palette";
import { mixRGB } from "./depth";

export interface StoneLook {
  /** 石の基本色 (かすみ済み) */
  body: RGB;
  /** 上から当たる光の色 */
  light: RGB;
  /** 苔の色 (かすみ済み) */
  moss: RGB;
}

const rgb = (c: RGB): string => `rgb(${c[0]},${c[1]},${c[2]})`;
const rgba = (c: RGB, a: number): string =>
  `rgba(${c[0]},${c[1]},${c[2]},${Math.min(1, Math.max(0, a)).toFixed(3)})`;
const darken = (c: RGB, t: number): RGB => mixRGB(c, [0, 0, 0], t);

/** form (0..1 の数列) を u (0..1) でなめらかに補間する */
function sampleForm(form: ReadonlyArray<number>, u: number): number {
  if (form.length === 0) return 0.5;
  const x = Math.min(0.9999, Math.max(0, u)) * (form.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  const a = form[i];
  const b = form[Math.min(form.length - 1, i + 1)];
  const s = f * f * (3 - 2 * f);
  return a + (b - a) * s;
}

/** 石の上端の y を u (0..1) ごとに返す。ドーム形にごつごつした起伏を重ねる */
export function rockTop(h: number, base: number, form: ReadonlyArray<number>, u: number): number {
  const dome = Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, u))), 0.55);
  const bumps = 0.78 + 0.3 * sampleForm(form, u);
  return base - h * Math.min(1, dome * bumps);
}

/** ごつごつした石: 上から光が当たる陰影、縁のハイライト、ひび、手前の石には苔 */
export function drawRock(
  ctx: CanvasRenderingContext2D,
  x: number,
  w: number,
  h: number,
  base: number,
  form: ReadonlyArray<number>,
  look: StoneLook,
  mossy: boolean,
): void {
  const N = 18;
  const top = (u: number) => rockTop(h, base, form, u);
  ctx.beginPath();
  ctx.moveTo(x, base);
  for (let k = 0; k <= N; k++) ctx.lineTo(x + (w * k) / N, top(k / N));
  ctx.lineTo(x + w, base);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, base - h, 0, base);
  g.addColorStop(0, rgb(mixRGB(look.body, look.light, 0.35)));
  g.addColorStop(0.55, rgb(look.body));
  g.addColorStop(1, rgb(darken(look.body, 0.35)));
  ctx.fillStyle = g;
  ctx.fill();

  // 光の当たる上の縁
  ctx.beginPath();
  for (let k = 3; k <= N - 3; k++) {
    const px = x + (w * k) / N;
    const py = top(k / N) + 1;
    if (k === 3) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.lineWidth = Math.max(0.8, h * 0.05);
  ctx.strokeStyle = rgba(mixRGB(look.body, look.light, 0.7), 0.55);
  ctx.stroke();

  // ひび (form から位置を決める)
  ctx.lineWidth = Math.max(0.5, h * 0.025);
  ctx.strokeStyle = rgba(darken(look.body, 0.35), 0.5);
  for (let c = 0; c < 2; c++) {
    const u = 0.3 + 0.4 * sampleForm(form, 0.2 + c * 0.5);
    const sx = x + w * u;
    const sy = top(u) + h * 0.15;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + w * 0.06 * (c ? 1 : -1), sy + h * 0.3);
    ctx.lineTo(sx + w * 0.02, sy + h * 0.55);
    ctx.stroke();
  }

  // 苔: 上面の一部にこんもり
  if (mossy) {
    const from = 0.25 + 0.15 * sampleForm(form, 0.9);
    const to = from + 0.3 + 0.15 * sampleForm(form, 0.1);
    ctx.fillStyle = rgba(look.moss, 0.85);
    const blobs = 7;
    for (let b = 0; b < blobs; b++) {
      const u = from + ((to - from) * (b + 0.5)) / blobs;
      const r = Math.max(1.5, h * (0.08 + 0.06 * sampleForm(form, u)));
      ctx.beginPath();
      ctx.arc(x + w * u, top(u) + r * 0.4, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = rgba(mixRGB(look.moss, look.light, 0.35), 0.6);
    for (let b = 0; b < blobs; b += 2) {
      const u = from + ((to - from) * (b + 0.5)) / blobs;
      const r = Math.max(1, h * 0.05);
      ctx.beginPath();
      ctx.arc(x + w * u - r * 0.3, top(u), r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** 枝分かれした流木: 主幹と枝、木肌の筋 */
export function drawWood(
  ctx: CanvasRenderingContext2D,
  x: number,
  w: number,
  h: number,
  base: number,
  form: ReadonlyArray<number>,
  look: StoneLook,
): void {
  const wood: RGB = [
    Math.round(look.body[0] * 0.95 + 14),
    Math.round(look.body[1] * 0.78 + 4),
    Math.round(look.body[2] * 0.6),
  ];
  const t = Math.max(4, w * 0.15);
  const tip: [number, number] = [x + w * (0.68 + 0.1 * sampleForm(form, 0.3)), base - h];
  const limb = (from: [number, number], to: [number, number], thick: number) => {
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const bend = len * 0.08;
    const mx = (from[0] + to[0]) / 2 + nx * bend;
    const my = (from[1] + to[1]) / 2 + ny * bend;
    ctx.beginPath();
    ctx.moveTo(from[0] - (nx * thick) / 2, from[1] - (ny * thick) / 2);
    ctx.quadraticCurveTo(mx - (nx * thick) / 2, my - (ny * thick) / 2, to[0] - nx * thick * 0.15, to[1] - ny * thick * 0.15);
    ctx.lineTo(to[0] + nx * thick * 0.15, to[1] + ny * thick * 0.15);
    ctx.quadraticCurveTo(mx + (nx * thick) / 2, my + (ny * thick) / 2, from[0] + (nx * thick) / 2, from[1] + (ny * thick) / 2);
    ctx.closePath();
    const g = ctx.createLinearGradient(from[0] - nx * thick, from[1] - ny * thick, from[0] + nx * thick, from[1] + ny * thick);
    g.addColorStop(0, rgb(mixRGB(wood, look.light, 0.25)));
    g.addColorStop(1, rgb(darken(wood, 0.35)));
    ctx.fillStyle = g;
    ctx.fill();
    // 木肌の筋
    ctx.lineWidth = Math.max(0.4, thick * 0.08);
    ctx.strokeStyle = rgba(darken(wood, 0.45), 0.55);
    for (const o of [-0.22, 0.08, 0.3]) {
      ctx.beginPath();
      ctx.moveTo(from[0] + nx * thick * o, from[1] + ny * thick * o);
      ctx.quadraticCurveTo(mx + nx * thick * o, my + ny * thick * o, to[0] + nx * thick * o * 0.3, to[1] + ny * thick * o * 0.3);
      ctx.stroke();
    }
  };
  const root: [number, number] = [x + t * 0.8, base];
  limb(root, tip, t);
  // 枝: 主幹の途中から 1〜2 本
  const fork = 0.45 + 0.2 * sampleForm(form, 0.6);
  const fx = root[0] + (tip[0] - root[0]) * fork;
  const fy = root[1] + (tip[1] - root[1]) * fork;
  limb([fx, fy], [Math.min(x + w, fx + w * 0.35), fy - h * (0.25 + 0.2 * sampleForm(form, 0.8))], t * 0.55);
  if (sampleForm(form, 0.1) > 0.5) {
    limb([fx, fy], [Math.max(x, fx - w * 0.25), fy - h * 0.35], t * 0.4);
  }
}

/** index から決まる 0..1 の擬似乱数 (乱数列を消費しない) */
const hash = (i: number): number => {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** 底砂: 帯の上に小石を散らす。小石は手前 (下) ほど大きい */
export function drawGravel(
  ctx: CanvasRenderingContext2D,
  width: number,
  top: number,
  bottom: number,
  sand: RGB,
  light: RGB,
  seed: number,
): void {
  const band = bottom - top;
  const g = ctx.createLinearGradient(0, top, 0, bottom);
  g.addColorStop(0, rgb(mixRGB(sand, light, 0.18)));
  g.addColorStop(1, rgb(darken(sand, 0.2)));
  ctx.fillStyle = g;
  ctx.fillRect(0, top, width, band);
  const n = Math.max(20, Math.round(width / 7));
  for (let i = 0; i < n; i++) {
    const a = hash(i + seed * 1000);
    const b = hash(i * 3.1 + seed * 777);
    const c = hash(i * 7.7 + seed * 333);
    const v = b; // 0 = 帯の上 (奥) 〜 1 = 下 (手前)
    const px = a * width;
    const py = top + band * (0.15 + 0.8 * v);
    const r = 1 + (1.2 + 2.6 * c) * (0.5 + 0.5 * v);
    const tone = c < 0.33 ? darken(sand, 0.25) : c < 0.66 ? mixRGB(sand, light, 0.3) : darken(sand, 0.1);
    ctx.fillStyle = rgb(tone);
    ctx.beginPath();
    ctx.ellipse(px, py, r * 1.3, r * 0.8, (c - 0.5) * 0.8, 0, Math.PI * 2);
    ctx.fill();
  }
}
