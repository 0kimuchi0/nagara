import type { Lighting } from "../palette";
import { smooth } from "../audio/analysis";
import type { Bounds, SceneElement, Stimulus } from "./types";

/** 拍でゆらぎの目標を保持する時間 (秒)。フレームレートに依存させない */
const WOBBLE_HOLD = 0.1;

interface Ray {
  /** 0..1 (幅に対する比率) */
  nx: number;
  /** 幅に対する比率 */
  nwidth: number;
  tilt: number;
  phase: number;
  freq: number;
}

export class LightRays implements SceneElement {
  private rays: Ray[] = [];
  private bounds: Bounds;
  private rng: () => number;
  private time = 0;
  private wobble = 0;
  private wobbleHold = 0;
  private volume = 0;

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
    const n = 4 + Math.floor(this.rng() * 3);
    this.rays = [];
    for (let i = 0; i < n; i++) {
      this.rays.push({
        nx: (i + 0.5 + (this.rng() - 0.5) * 0.6) / n,
        nwidth: 0.04 + this.rng() * 0.06,
        tilt: 0.15 + this.rng() * 0.2,
        phase: this.rng() * Math.PI * 2,
        freq: 0.1 + this.rng() * 0.15,
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

  draw(ctx: CanvasRenderingContext2D, l: Lighting): void {
    const [r, g, b] = l.ray;
    const intensity = l.rayIntensity * (0.6 + 0.4 * Math.max(0, Math.min(1, this.volume)));
    const h = this.bounds.height;
    for (const ray of this.rays) {
      const rx = ray.nx * this.bounds.width;
      const rw = ray.nwidth * this.bounds.width;
      const sway = Math.sin(this.time * ray.freq * 2 + ray.phase);
      const beatSway = this.wobble * 0.15 * Math.sin(this.time * 3 + ray.phase);
      const x0 = rx + sway * 30;
      const dx = h * (ray.tilt + beatSway);
      const a = intensity * (0.12 + 0.05 * sway) * (1 + this.wobble * 0.3);
      const grad = ctx.createLinearGradient(x0, 0, x0 + dx, h);
      grad.addColorStop(0, `rgba(${r},${g},${b},${a})`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(x0 - rw * 0.5, 0);
      ctx.lineTo(x0 + rw * 0.5, 0);
      ctx.lineTo(x0 + dx + rw * 1.5, h);
      ctx.lineTo(x0 + dx - rw * 1.5, h);
      ctx.closePath();
      ctx.fill();
    }
  }
}
