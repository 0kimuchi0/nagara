import type { RGB } from "../palette";
import { mixRGB } from "./depth";

/** 株の中心線: t (0 = 根元, 1 = 先端) → 画面上の位置 */
export type Spine = (t: number) => [number, number];

export type PlantKind = "ribbon" | "stem" | "sword";

export interface PlantLook {
  color: RGB;
  /** 先端の色 (有茎草の赤み、リボンの明るい先端など) */
  tip: RGB;
  alpha: number;
  /** 見かけの太さ (px) */
  width: number;
}

const rgba = (c: RGB, a: number): string =>
  `rgba(${c[0]},${c[1]},${c[2]},${Math.min(1, Math.max(0, a)).toFixed(3)})`;
const lighten = (c: RGB, t: number): RGB => mixRGB(c, [255, 255, 255], t);
const darken = (c: RGB, t: number): RGB => mixRGB(c, [0, 0, 0], t);

/** 中心線の向き (単位ベクトル) を差分で求める */
function tangent(spine: Spine, t: number): [number, number] {
  const a = spine(Math.max(0, t - 0.02));
  const b = spine(Math.min(1, t + 0.02));
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  return [dx / len, dy / len];
}

/**
 * リボン状の葉 (ヴァリスネリア風): 一定の幅で長く伸び、先端だけ細くなる帯。
 * 片側の縁を暗く、中心に明るい筋を入れて、ねじれと厚みを感じさせる。
 */
export function drawRibbon(ctx: CanvasRenderingContext2D, spine: Spine, look: PlantLook): void {
  const N = 14;
  const left: Array<[number, number]> = [];
  const right: Array<[number, number]> = [];
  for (let k = 0; k <= N; k++) {
    const t = k / N;
    const [x, y] = spine(t);
    const [tx, ty] = tangent(spine, t);
    const taper = t < 0.8 ? 1 - 0.25 * t : Math.max(0, ((1 - t) / 0.2) * 0.8);
    // ゆるいねじれ: 幅がわずかに波打つ
    const half = (look.width / 2) * taper * (0.75 + 0.25 * Math.cos(t * 7));
    left.push([x - ty * half, y + tx * half]);
    right.push([x + ty * half, y - tx * half]);
  }
  const g = ctx.createLinearGradient(...spine(0), ...spine(1));
  g.addColorStop(0, rgba(darken(look.color, 0.15), look.alpha));
  g.addColorStop(1, rgba(mixRGB(look.color, look.tip, 0.6), look.alpha));
  ctx.beginPath();
  ctx.moveTo(left[0][0], left[0][1]);
  for (const [x, y] of left) ctx.lineTo(x, y);
  for (let k = right.length - 1; k >= 0; k--) ctx.lineTo(right[k][0], right[k][1]);
  ctx.closePath();
  ctx.fillStyle = g;
  ctx.fill();
  // 中心の明るい筋
  ctx.beginPath();
  ctx.moveTo(...spine(0));
  for (let k = 1; k <= N - 2; k++) ctx.lineTo(...spine(k / N));
  ctx.lineWidth = Math.max(0.5, look.width * 0.12);
  ctx.strokeStyle = rgba(lighten(look.color, 0.35), look.alpha * 0.6);
  ctx.stroke();
}

/**
 * 有茎草 (ロタラ風): 細い茎に、小さな葉が対になって並ぶ。先端ほど葉が小さく赤みを帯びる。
 */
export function drawStem(ctx: CanvasRenderingContext2D, spine: Spine, look: PlantLook, swayPhase: number): void {
  const N = 10;
  ctx.beginPath();
  ctx.moveTo(...spine(0));
  for (let k = 1; k <= N; k++) ctx.lineTo(...spine(k / N));
  ctx.lineWidth = Math.max(0.6, look.width * 0.28);
  ctx.strokeStyle = rgba(darken(look.color, 0.2), look.alpha);
  ctx.stroke();

  const pairs = 9;
  for (let k = 1; k <= pairs; k++) {
    const t = k / (pairs + 0.5);
    const [x, y] = spine(t);
    const [tx, ty] = tangent(spine, t);
    const base = Math.atan2(ty, tx);
    const len = look.width * (2.6 - 1.4 * t);
    const c = mixRGB(look.color, look.tip, Math.pow(t, 1.6));
    ctx.fillStyle = rgba(k % 2 === 0 ? c : lighten(c, 0.1), look.alpha);
    for (const side of [-1, 1]) {
      // 葉は茎から斜め上へ。わずかにそよぐ
      const ang = base + side * (1.05 - 0.35 * t) + Math.sin(swayPhase + k) * 0.08;
      const cx = x + Math.cos(ang) * len * 0.55;
      const cy = y + Math.sin(ang) * len * 0.55;
      ctx.beginPath();
      ctx.ellipse(cx, cy, len * 0.55, Math.max(0.6, len * 0.18), ang, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/**
 * 剣状の葉の水草 (エキノドルス風): 根元から幅広の葉が放射状に広がるロゼット。
 */
export function drawSword(
  ctx: CanvasRenderingContext2D,
  root: [number, number],
  height: number,
  look: PlantLook,
  sway: number,
  seed: number,
): void {
  const leaves = 5 + Math.floor(seed * 3);
  for (let k = 0; k < leaves; k++) {
    // 外側の葉ほど寝ていて短い。真ん中の葉が一番高い
    const u = leaves === 1 ? 0 : (k / (leaves - 1)) * 2 - 1; // -1..1
    const lean = u * 0.85 + sway * (0.4 + 0.6 * (1 - Math.abs(u)));
    const len = height * (1 - 0.35 * Math.abs(u)) * (0.9 + 0.2 * Math.sin(seed * 10 + k));
    const tipX = root[0] + Math.sin(lean) * len;
    const tipY = root[1] - Math.cos(lean) * len;
    // 葉の幅方向 (中心線に垂直)
    const nx = Math.cos(lean);
    const ny = Math.sin(lean);
    const w = look.width * (1.6 + 0.6 * (1 - Math.abs(u)));
    const midX = root[0] + Math.sin(lean) * len * 0.45 + sway * len * 0.08;
    const midY = root[1] - Math.cos(lean) * len * 0.45;
    const c = k % 2 === 0 ? look.color : darken(look.color, 0.12);
    const g = ctx.createLinearGradient(root[0], root[1], tipX, tipY);
    g.addColorStop(0, rgba(darken(c, 0.25), look.alpha));
    g.addColorStop(1, rgba(mixRGB(c, look.tip, 0.4), look.alpha));
    ctx.beginPath();
    ctx.moveTo(root[0], root[1]);
    ctx.quadraticCurveTo(midX - nx * w * 1.6, midY - ny * w * 1.6, tipX, tipY);
    ctx.quadraticCurveTo(midX + nx * w * 1.6, midY + ny * w * 1.6, root[0], root[1]);
    ctx.closePath();
    ctx.fillStyle = g;
    ctx.fill();
    // 葉脈
    ctx.beginPath();
    ctx.moveTo(root[0], root[1]);
    ctx.quadraticCurveTo(midX, midY, tipX, tipY);
    ctx.lineWidth = Math.max(0.5, look.width * 0.15);
    ctx.strokeStyle = rgba(lighten(c, 0.3), look.alpha * 0.5);
    ctx.stroke();
  }
}
