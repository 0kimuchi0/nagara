import type { Lighting } from "../palette";
import { smooth } from "../audio/analysis";
import type { Bounds, SceneElement, Stimulus } from "./types";

/** 拍でゆらぎの目標を保持する時間 (秒)。フレームレートに依存させない */
const WOBBLE_HOLD = 0.1;
/** 光が水に吸収されて弱まる深さの目安 (画面の高さに対する比率)。この深さで約 37% になる */
const ABSORB = 0.42;
/** 筋の広がり: 画面の左右端ほど外向きに傾く (水面近くの一点から扇状に差し込む) */
const FAN = 0.35;
/** 柔らかい縁を作るための重ね描き: [幅の倍率, 明るさの倍率] */
const LAYERS: ReadonlyArray<[number, number]> = [
  [2.4, 0.16],
  [1.2, 0.32],
  [0.45, 0.5],
];
const BASE_ALPHA = 0.55;

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
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < this.rays.length; i++) {
      const ray = this.rays[i];
      const s = this.strengthOf(ray);
      const xTop = this.rayCentreAt(i, 0);
      const xBot = this.rayCentreAt(i, bottom);
      const wTop = this.widthAt(ray, 0);
      const wBot = this.widthAt(ray, bottom);
      for (const [wm, am] of LAYERS) {
        const a = clamp01(intensity * s * am * BASE_ALPHA);
        if (a < 0.002) continue;
        // 軸に沿って、水に吸収されて弱まる
        const grad = ctx.createLinearGradient(xTop, 0, xBot, bottom);
        grad.addColorStop(0, `rgba(${r},${g},${b},${a.toFixed(3)})`);
        grad.addColorStop(0.3, `rgba(${r},${g},${b},${(a * this.absorb(bottom * 0.3)).toFixed(3)})`);
        grad.addColorStop(0.65, `rgba(${r},${g},${b},${(a * this.absorb(bottom * 0.65)).toFixed(3)})`);
        grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(xTop - (wTop * wm) / 2, 0);
        ctx.lineTo(xTop + (wTop * wm) / 2, 0);
        ctx.lineTo(xBot + (wBot * wm) / 2, bottom);
        ctx.lineTo(xBot - (wBot * wm) / 2, bottom);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();
  }
}
