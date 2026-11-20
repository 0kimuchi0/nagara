import type { Lighting } from "../palette";
import { smooth } from "../audio/analysis";
import type { Bounds, SceneElement, Stimulus } from "./types";

const SEGMENTS = 5;
const SPACING = 40;

interface Plant {
  x: number;
  height: number;
  freq: number;
  phase: number;
  width: number;
}

export class Plants implements SceneElement {
  private plants: Plant[] = [];
  private bounds: Bounds;
  private rng: () => number;
  private time = 0;
  private sway = 0;

  constructor(b: Bounds, rng: () => number) {
    this.rng = rng;
    this.bounds = { ...b };
    this.layout();
  }

  get count(): number {
    return this.plants.length;
  }

  get roots(): ReadonlyArray<number> {
    return this.plants.map((p) => p.x);
  }

  private layout(): void {
    const n = Math.round(this.bounds.width / SPACING);
    this.plants = [];
    for (let i = 0; i < n; i++) {
      this.plants.push({
        x: this.rng() * this.bounds.width,
        height: this.bounds.height * (0.15 + this.rng() * 0.3),
        freq: 0.5 + this.rng() * 0.6,
        phase: this.rng() * Math.PI * 2,
        width: 3 + this.rng() * 4,
      });
    }
  }

  /** 先端の横ずれ。節 t(0..1) では t^2 で先端ほど大きくなる */
  private offsetAt(p: Plant, t: number): number {
    const amp = p.height * (0.06 + 0.25 * this.sway);
    return Math.sin(this.time * p.freq * 2 + p.phase + t * 1.2) * amp * t * t;
  }

  tipOffset(i: number): number {
    const p = this.plants[i];
    return p ? this.offsetAt(p, 1) : 0;
  }

  resize(b: Bounds): void {
    this.bounds = { ...b };
    this.layout();
  }

  update(dt: number, s: Stimulus): void {
    this.time += dt * Math.max(0, s.speed);
    this.sway = smooth(this.sway, Math.max(0, Math.min(1, s.low)), dt, 0.3, 1.2);
  }

  draw(ctx: CanvasRenderingContext2D, l: Lighting): void {
    const [r, g, b] = l.plant;
    const base = this.bounds.height;
    ctx.lineCap = "round";
    for (const p of this.plants) {
      const shade = 0.75 + 0.25 * Math.sin(p.phase);
      ctx.strokeStyle = `rgba(${Math.round(r * shade)},${Math.round(g * shade)},${Math.round(b * shade)},0.85)`;
      for (let k = 0; k < SEGMENTS; k++) {
        const t0 = k / SEGMENTS;
        const t1 = (k + 1) / SEGMENTS;
        ctx.lineWidth = p.width * (1 - t0 * 0.8);
        ctx.beginPath();
        ctx.moveTo(p.x + this.offsetAt(p, t0), base - p.height * t0);
        ctx.lineTo(p.x + this.offsetAt(p, t1), base - p.height * t1);
        ctx.stroke();
      }
    }
  }
}
