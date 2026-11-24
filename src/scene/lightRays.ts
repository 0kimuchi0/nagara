import type { Lighting } from "../palette";
import { smooth } from "../audio/analysis";
import type { Bounds, SceneElement, Stimulus } from "./types";

/** 拍でゆらぎの目標を保持する時間 (秒)。フレームレートに依存させない */
const WOBBLE_HOLD = 0.1;
/** 光が水に吸収されて弱まる深さの目安 (画面の高さに対する比率)。この深さで約 37% になる */
const ABSORB = 0.42;
/** 筋の広がり: 画面の左右端ほど外向きに傾く (水面近くの一点から扇状に差し込む) */
const FAN = 0.35;
/** 筋を縦に分けて描く数。区切りごとに横向きのグラデーションをかける */
const SLICES = 32;
/** 横方向のぼかしの広がり (筋の太さに対する倍率)。外側はほぼ透明になる */
const SOFT_WIDTH = 2.6;
/** 横方向の明るさの分布 (0..1 の位置 → 中心を 1 とした明るさ)。両端は 0 */
const PROFILE: ReadonlyArray<[number, number]> = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1].map(
  (u): [number, number] => [u, u === 0 || u === 1 ? 0 : Math.exp(-(((u - 0.5) / 0.22) ** 2))],
);
/** 筋の下端で消し込む長さ (画面の高さに対する比率) */
const END_FADE = 0.25;
const BASE_ALPHA = 0.42;

export interface Ray {
  /** 0..1 水面での位置 (幅に対する比率) */
  nx: number;
  /** 水面での太さ (幅に対する比率) */
  nwidth: number;
  phase: number;
  /** ゆらぎの速さ (2 つの周期を重ねて規則的に見えないようにする) */
  f1: number;
  f2: number;
  /** 横方向の漂いの速さ */
  drift: number;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/**
 * 水面から差し込む光の筋。
 * - 水面の一点から扇状に広がり、深くなるほど太く、水に吸収されて弱まる
 * - 中心が明るく縁がぼやける (幅の違う帯を加算で重ねる)
 * - 水面の波に合わせて、筋ごとに明るさがゆっくり強まったり消えたりする
 */
export class LightRays implements SceneElement {
  rays: Ray[] = [];
  private bounds: Bounds;
  private rng: () => number;
  private time = 0;
  private wobble = 0;
  private wobbleHold = 0;
  private volume = 0;
  private sunLean = 0.17;

  constructor(b: Bounds, rng: () => number) {
    this.rng = rng;
    this.bounds = { ...b };
    this.layout();
  }

  get beatWobble(): number {
    return this.wobble;
  }

  get xs(): number[] {
    return this.rays.map((r) => r.nx * this.bounds.width);
  }

  private layout(): void {
    this.sunLean = 0.12 + this.rng() * 0.1;
    const n = 7 + Math.floor(this.rng() * 4);
    this.rays = [];
    for (let i = 0; i < n; i++) {
      const thin = this.rng() < 0.4;
      this.rays.push({
        nx: (i + 0.5 + (this.rng() - 0.5) * 0.7) / n,
        nwidth: thin ? 0.008 + this.rng() * 0.012 : 0.025 + this.rng() * 0.04,
        phase: this.rng() * Math.PI * 2,
        f1: 0.25 + this.rng() * 0.35,
        f2: 0.6 + this.rng() * 0.6,
        drift: 0.05 + this.rng() * 0.08,
      });
    }
  }

  resize(b: Bounds): void {
    this.bounds = { ...b };
  }

  update(dt: number, s: Stimulus): void {
    this.time += dt * Math.max(0, s.speed);
    this.volume = s.volume;
    // 拍では素早く、ただし段差なく立ち上げ、以後は滑らかに減衰させる
    if (s.beat) this.wobbleHold = WOBBLE_HOLD;
    this.wobbleHold = Math.max(0, this.wobbleHold - dt);
    this.wobble = smooth(this.wobble, this.wobbleHold > 0 ? 1 : 0, dt, 0.03, 0.6);
  }

  /** 筋の傾き (高さ 1px あたりの横ずれ) */
  private leanOf(r: Ray): number {
    const beat = this.wobble * 0.04 * Math.sin(this.time * 3 + r.phase);
    return this.sunLean + (r.nx - 0.5) * FAN + beat;
  }

  /** i 番目の筋の、高さ y における中心の x */
  rayCentreAt(i: number, y: number): number {
    const r = this.rays[i];
    if (!r) return 0;
    const W = this.bounds.width;
    const x0 = r.nx * W + Math.sin(this.time * r.drift + r.phase) * W * 0.02;
    return x0 + this.leanOf(r) * y;
  }

  /** i 番目の筋の、高さ y における太さ (px)。深いほど広がる */
  private widthAt(r: Ray, y: number): number {
    return r.nwidth * this.bounds.width * (1 + 1.3 * (y / Math.max(1, this.bounds.height)));
  }

  /** 筋ごとの今の明るさ 0..1。水面の波で強まったり消えかけたりする */
  private strengthOf(r: Ray): number {
    const wave = 0.6 * Math.sin(this.time * r.f1 + r.phase) + 0.4 * Math.sin(this.time * r.f2 + r.phase * 1.7);
    return 0.25 + 0.75 * Math.pow(clamp01(0.5 + 0.5 * wave), 1.4);
  }

  private absorb(y: number): number {
    return Math.exp(-Math.max(0, y) / (ABSORB * Math.max(1, this.bounds.height)));
  }

  /** 位置 (x, y) が光の筋にどれだけ照らされているか 0..1 (照明の強さは含まない) */
  coverage(x: number, y: number): number {
    let sum = 0;
    const fade = this.absorb(y);
    for (let i = 0; i < this.rays.length; i++) {
      const r = this.rays[i];
      const d = (x - this.rayCentreAt(i, y)) / (this.widthAt(r, y) * 0.6);
      sum += this.strengthOf(r) * Math.exp(-d * d);
    }
    return clamp01(sum * fade);
  }

  draw(ctx: CanvasRenderingContext2D, l: Lighting): void {
    const [r, g, b] = l.ray;
    const H = this.bounds.height;
    const v = clamp01(this.volume);
    const intensity = l.rayIntensity * (0.7 + 0.3 * v) * (1 + this.wobble * 0.3);
    const bottom = H * 0.95;
    const sliceH = bottom / SLICES;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < this.rays.length; i++) {
      const ray = this.rays[i];
      const peak0 = clamp01(intensity * this.strengthOf(ray) * BASE_ALPHA);
      if (peak0 < 0.002) continue;
      for (let k = 0; k < SLICES; k++) {
        // 継ぎ目は整数の位置にそろえ、重ねない (加算で重なると明るい横線が出る)
        const y0 = Math.round(k * sliceH);
        const y1 = Math.round((k + 1) * sliceH);
        const ym = (y0 + y1) / 2;
        // 深さで吸収されて弱まり、下端はなめらかに消える
        const end = clamp01((bottom - ym) / (END_FADE * H));
        const a = peak0 * this.absorb(ym) * end * end * (3 - 2 * end);
        if (a < 0.001) continue;
        const c0 = this.rayCentreAt(i, y0);
        const c1 = this.rayCentreAt(i, y1);
        const h0 = (this.widthAt(ray, y0) * SOFT_WIDTH) / 2;
        const h1 = (this.widthAt(ray, y1) * SOFT_WIDTH) / 2;
        // 筋を横切る向き (筋の軸に垂直) にグラデーションをかけ、両側へなめらかにぼかす
        const cm = (c0 + c1) / 2;
        const hm = (h0 + h1) / 2;
        const ax = c1 - c0;
        const ay = y1 - y0;
        const len = Math.hypot(ax, ay) || 1;
        const nx = ay / len;
        const ny = -ax / len;
        const grad = ctx.createLinearGradient(cm - nx * hm, ym - ny * hm, cm + nx * hm, ym + ny * hm);
        for (const [u, w] of PROFILE) grad.addColorStop(u, `rgba(${r},${g},${b},${(a * w).toFixed(3)})`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(c0 - h0, y0);
        ctx.lineTo(c0 + h0, y0);
        ctx.lineTo(c1 + h1, y1);
        ctx.lineTo(c1 - h1, y1);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();
  }
}
