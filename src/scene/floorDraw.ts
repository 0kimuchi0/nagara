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
export const hash = (i: number): number => {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

export interface Pebble {
  x: number;
  y: number;
  r: number;
  /** 0 = 底床の上の縁 (奥) 〜 1 = 画面の下端 (手前) */
  v: number;
  tone: number;
  tilt: number;
}

export interface Tuft {
  x: number;
  y: number;
  blades: number;
  len: number;
  seed: number;
}

export interface GroundLook {
  sand: RGB;
  light: RGB;
  grass: RGB;
}

/** 底床: 起伏のある上の縁から画面の下端まで。上の縁に光、下ほど暗く、細かい砂粒を散らす */
export function drawSubstrate(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  top: (x: number) => number,
  look: GroundLook,
  seed: number,
): void {
  const step = Math.max(6, width / 140);
  let minTop = height;
  ctx.beginPath();
  ctx.moveTo(0, height);
  for (let x = 0; x <= width + step; x += step) {
    const px = Math.min(x, width);
    const y = top(px);
    minTop = Math.min(minTop, y);
    ctx.lineTo(px, y);
  }
  ctx.lineTo(width, height);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, minTop, 0, height);
  g.addColorStop(0, rgb(mixRGB(look.sand, look.light, 0.22)));
  g.addColorStop(0.35, rgb(look.sand));
  g.addColorStop(1, rgb(darken(look.sand, 0.35)));
  ctx.fillStyle = g;
  ctx.fill();

  // 上の縁: 光がかすめて明るい
  ctx.beginPath();
  for (let x = 0; x <= width + step; x += step) {
    const px = Math.min(x, width);
    if (x === 0) ctx.moveTo(px, top(px) + 0.8);
    else ctx.lineTo(px, top(px) + 0.8);
  }
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = rgba(mixRGB(look.sand, look.light, 0.6), 0.55);
  ctx.stroke();

  // 細かい砂粒: 明るい粒と暗い粒を交互に
  const grains = Math.round(width / 2.5);
  const lightGrain = rgba(mixRGB(look.sand, look.light, 0.45), 0.55);
  const darkGrain = rgba(darken(look.sand, 0.4), 0.45);
  for (let i = 0; i < grains; i++) {
    const x = hash(i * 1.71 + seed * 91) * width;
    const v = hash(i * 2.93 + seed * 57);
    const t = top(x);
    const y = t + 1 + (height - t - 1) * v;
    const s = 0.6 + 1.1 * v;
    ctx.fillStyle = i % 2 === 0 ? lightGrain : darkGrain;
    ctx.fillRect(x, y, s, s * 0.7);
  }
}

/** 小石: 下に落ちる影、本体、光の当たる上面の 3 つで立体的に */
export function drawPebbles(ctx: CanvasRenderingContext2D, pebbles: ReadonlyArray<Pebble>, look: GroundLook): void {
  const shadow = rgba(darken(look.sand, 0.6), 0.35);
  for (const p of pebbles) {
    ctx.fillStyle = shadow;
    ctx.beginPath();
    ctx.ellipse(p.x + p.r * 0.25, p.y + p.r * 0.45, p.r * 1.35, p.r * 0.55, p.tilt, 0, Math.PI * 2);
    ctx.fill();
    const body = p.tone < 0.33 ? darken(look.sand, 0.3) : p.tone < 0.66 ? mixRGB(look.sand, look.light, 0.25) : darken(look.sand, 0.12);
    ctx.fillStyle = rgb(body);
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, p.r * 1.3, p.r * 0.8, p.tilt, 0, Math.PI * 2);
    ctx.fill();
    if (p.r > 1.6) {
      ctx.fillStyle = rgba(mixRGB(body, look.light, 0.55), 0.6);
      ctx.beginPath();
      ctx.ellipse(p.x - p.r * 0.3, p.y - p.r * 0.35, p.r * 0.55, p.r * 0.25, p.tilt, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** 物が地面に接する所の影 (石や流木の足元) */
export function drawContactShadow(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, sand: RGB, strength: number): void {
  ctx.fillStyle = rgba(darken(sand, 0.7), 0.3 * strength);
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = rgba(darken(sand, 0.8), 0.22 * strength);
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx * 0.7, ry * 0.6, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** 前景草の小さな茂み: 細い葉が数本、根元から扇形に。ゆっくりそよぐ */
export function drawTufts(ctx: CanvasRenderingContext2D, tufts: ReadonlyArray<Tuft>, look: GroundLook, time: number): void {
  ctx.lineCap = "round";
  for (const t of tufts) {
    const sway = Math.sin(time * 1.3 + t.seed * 10) * 0.18;
    for (let b = 0; b < t.blades; b++) {
      const u = t.blades === 1 ? 0 : (b / (t.blades - 1)) * 2 - 1;
      const len = t.len * (0.7 + 0.3 * hash(t.seed * 50 + b));
      const ang = u * 0.7 + sway * (0.6 + 0.4 * Math.abs(u));
      const tipX = t.x + u * 3 + Math.sin(ang) * len;
      const tipY = t.y - Math.cos(ang) * len;
      const c = b % 2 === 0 ? look.grass : mixRGB(look.grass, look.light, 0.2);
      ctx.strokeStyle = rgb(c);
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(t.x + u * 2, t.y);
      ctx.quadraticCurveTo(t.x + u * 3 + Math.sin(ang) * len * 0.3, t.y - len * 0.55, tipX, tipY);
      ctx.stroke();
    }
  }
}

/** 落ち葉: 小さな茶色い葉が少しだけ */
export function drawLeaves(ctx: CanvasRenderingContext2D, leaves: ReadonlyArray<Pebble>, look: GroundLook): void {
  const brown: RGB = [Math.round(look.sand[0] * 0.9 + 25), Math.round(look.sand[1] * 0.7 + 5), Math.round(look.sand[2] * 0.45)];
  for (const l of leaves) {
    ctx.fillStyle = rgba(brown, 0.85);
    ctx.beginPath();
    ctx.ellipse(l.x, l.y, l.r * 2.2, l.r * 0.9, l.tilt, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = rgba(darken(brown, 0.4), 0.6);
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(l.x - Math.cos(l.tilt) * l.r * 2, l.y - Math.sin(l.tilt) * l.r * 2);
    ctx.lineTo(l.x + Math.cos(l.tilt) * l.r * 2, l.y + Math.sin(l.tilt) * l.r * 2);
    ctx.stroke();
  }
}
