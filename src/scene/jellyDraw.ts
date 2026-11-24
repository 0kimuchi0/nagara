import type { RGB } from "../palette";

/** 描画に必要な 1 匹分の状態 */
export interface JellyPose {
  x: number;
  y: number;
  /** 傘の基準半幅 (px) */
  unit: number;
  /** 0..1。1 で傘が最も閉じた状態 */
  pulse: number;
  /** 傘の開閉位相 (ラジアン) */
  phase: number;
  /** なびき用の平滑化した速度 (px/s) */
  velX: number;
  velY: number;
}

const MARGINAL = 22; // 縁の細い触手
const ORAL_ARMS = 4; // 口腕
const LOBES = 8; // 傘の縁のフリル
const GONADS = 4; // 四つ葉模様

const rgba = (c: RGB, a: number): string => `rgba(${c[0]},${c[1]},${c[2]},${a.toFixed(3)})`;
const mix = (a: RGB, b: RGB, t: number): RGB => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];
/** index から決まる 0..1 の擬似乱数 (乱数列を消費しない) */
const hash = (i: number): number => {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

const PINK: RGB = [255, 170, 215];
const WHITE: RGB = [255, 255, 255];

/**
 * ミズクラゲ風の海月を 1 匹描く。
 * 呼び出し側で ctx.save()/restore() する前提で、ここでは transform を自分で戻す。
 */
export function drawJelly(
  ctx: CanvasRenderingContext2D,
  p: JellyPose,
  time: number,
  tint: RGB,
  glow: number,
): void {
  // 開くと平たく広がり、閉じると幅が狭く背が高くなる
  const w = p.unit * (1.2 - 0.5 * p.pulse); // 傘の半幅 (最も膨らんだ所)
  const h = p.unit * (0.62 + 0.5 * p.pulse); // 傘の高さ
  // 閉じると縁が内側へ巻き込み、少し下に下がる
  const curl = p.pulse;
  const rimHalf = w * (1 - 0.32 * curl); // 縁の半幅
  const rimY = h * 0.18 * curl; // 縁の高さ
  // 進行方向へ少し傾ける (横 30px/s で約 0.12 rad)
  const tilt = Math.max(-0.25, Math.min(0.25, p.velX * 0.004));
  // なびき: 触手の先は動きと反対側へ流れる
  const trailX = -p.velX * 0.35;
  const trailY = Math.max(0, -p.velY) * 0.25; // 上昇中は下へ伸びる

  const bellColor = mix(tint, WHITE, 0.35);
  const armColor = mix(tint, PINK, 0.35);

  ctx.translate(p.x, p.y);
  ctx.rotate(tilt);

  // 発光のにじみ
  const haloR = w * 2.4;
  const halo = ctx.createRadialGradient(0, -h * 0.3, 0, 0, -h * 0.3, haloR);
  halo.addColorStop(0, rgba(tint, 0.3 * glow));
  halo.addColorStop(1, rgba(tint, 0));
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, -h * 0.3, haloR, 0, Math.PI * 2);
  ctx.fill();

  // 縁の細い触手 (傘の後ろ側から先に描く)
  ctx.lineCap = "round";
  for (let i = 0; i < MARGINAL; i++) {
    const u = i / (MARGINAL - 1); // 0..1 縁に沿った位置
    const rx = (u * 2 - 1) * rimHalf * 0.95;
    const len = h * (2.4 + hash(i) * 1.8);
    const segs = 9;
    ctx.beginPath();
    ctx.moveTo(rx, rimY);
    for (let k = 1; k <= segs; k++) {
      const t = k / segs;
      const wave = Math.sin(time * 1.8 + i * 0.7 - t * 4) * w * 0.12 * t;
      // 閉じるとすぼまり、開くと少し広がる。先端ほど遅れてなびく (t^2)
      const spread = 1 - (0.15 + 0.35 * curl) * t;
      ctx.lineTo(rx * spread + wave + trailX * t * t, rimY + len * t + trailY * t * t);
    }
    ctx.lineWidth = 0.7;
    ctx.strokeStyle = rgba(bellColor, (0.18 + 0.25 * glow) * (1 - 0.3 * hash(i + 50)));
    ctx.stroke();
  }

  // 口腕: ひらひらしたリボン
  for (let a = 0; a < ORAL_ARMS; a++) {
    const ax = ((a + 0.5) / ORAL_ARMS - 0.5) * w * 0.5;
    const len = h * (1.9 + hash(a + 20) * 0.6);
    const segs = 14;
    const left: Array<[number, number]> = [];
    const right: Array<[number, number]> = [];
    for (let k = 0; k <= segs; k++) {
      const t = k / segs;
      const cx =
        ax * (1 - 0.4 * t) +
        Math.sin(time * 1.2 + a * 1.7 - t * 3.2) * w * 0.14 * t +
        trailX * 0.8 * t * t;
      const cy = h * 0.1 + len * t + trailY * 0.8 * t * t;
      // 幅は付け根が太く先が細い。縁は細かく波打つ (フリル)
      const half = w * 0.09 * (1 - 0.7 * t) * (1 + 0.35 * Math.sin(t * 22 + time * 3 + a));
      left.push([cx - half, cy]);
      right.push([cx + half, cy]);
    }
    ctx.beginPath();
    ctx.moveTo(left[0][0], left[0][1]);
    for (const [x, y] of left) ctx.lineTo(x, y);
    for (let k = right.length - 1; k >= 0; k--) ctx.lineTo(right[k][0], right[k][1]);
    ctx.closePath();
    ctx.fillStyle = rgba(armColor, 0.14 + 0.2 * glow);
    ctx.fill();
    ctx.lineWidth = 0.6;
    ctx.strokeStyle = rgba(armColor, 0.25 + 0.25 * glow);
    ctx.stroke();
  }

  // 傘の輪郭: 上はなめらかなドーム、下の縁はフリル状に波打つ
  const rim = (path: CanvasRenderingContext2D, scale: number): void => {
    const W = w * scale;
    const H = h * scale;
    const R = rimHalf * scale;
    const Y = rimY * scale;
    // 左の縁 → 横に膨らむ肩 → 頂点 → 右の縁
    path.moveTo(-R, Y);
    path.bezierCurveTo(-W * 1.05, Y - H * 0.35, -W * 0.8, -H, 0, -H);
    path.bezierCurveTo(W * 0.8, -H, W * 1.05, Y - H * 0.35, R, Y);
    const steps = LOBES * 6;
    for (let s = 1; s <= steps; s++) {
      const u = 1 - (s / steps) * 2; // 1 → -1
      const lobe = Math.abs(Math.sin((s / steps) * Math.PI * LOBES));
      const ripple = Math.sin(p.phase * 2 + s * 0.4) * 0.03;
      // 閉じると縁の中央がやや持ち上がり、すぼまった形になる
      const lift = -H * 0.12 * curl * (1 - u * u);
      path.lineTo(u * R, Y + lift + H * (0.06 + 0.1 * lobe + ripple));
    }
    path.closePath();
  };

  // 外側の傘: 内側から光るグラデーション
  const bellFill = ctx.createRadialGradient(0, -h * 0.55, 0, 0, -h * 0.2, w * 1.15);
  bellFill.addColorStop(0, rgba(bellColor, 0.5 + 0.3 * glow));
  bellFill.addColorStop(0.55, rgba(tint, 0.2 + 0.2 * glow));
  bellFill.addColorStop(1, rgba(tint, 0.06 + 0.1 * glow));
  ctx.beginPath();
  rim(ctx, 1);
  ctx.fillStyle = bellFill;
  ctx.fill();

  // 内側の傘 (下傘) をうっすら重ねて厚みを出す
  ctx.beginPath();
  rim(ctx, 0.8);
  ctx.fillStyle = rgba(bellColor, 0.07 + 0.08 * glow);
  ctx.fill();

  // 四つ葉の生殖腺: 横から見た輪を楕円上に並べる
  for (let g = 0; g < GONADS; g++) {
    const ang = (g / GONADS) * Math.PI * 2 + Math.PI / 4 + p.phase * 0.05;
    const gx = Math.cos(ang) * w * 0.32;
    const gy = -h * 0.42 + Math.sin(ang) * h * 0.12;
    const front = Math.sin(ang) > 0 ? 1 : 0.55; // 奥の輪は薄く
    ctx.beginPath();
    ctx.ellipse(gx, gy, w * 0.14, h * 0.12, ang * 0.3, 0, Math.PI * 2);
    ctx.lineWidth = Math.max(1, w * 0.045);
    ctx.strokeStyle = rgba(armColor, (0.3 + 0.3 * glow) * front);
    ctx.stroke();
  }

  // 傘のつや (上部のハイライト)
  ctx.beginPath();
  ctx.ellipse(-w * 0.25, -h * 0.75, w * 0.35, h * 0.12, -0.35, 0, Math.PI * 2);
  ctx.fillStyle = rgba(WHITE, 0.08 + 0.08 * glow);
  ctx.fill();

  // 縁取り
  ctx.beginPath();
  rim(ctx, 1);
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = rgba(WHITE, 0.25 + 0.3 * glow);
  ctx.stroke();

  ctx.rotate(-tilt);
  ctx.translate(-p.x, -p.y);
}
