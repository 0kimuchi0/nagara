import type { Lighting } from "../palette";
import type { Bounds, SceneElement, Stimulus } from "./types";

export interface FloorShape {
  kind: "rock" | "wood";
  x: number;
  w: number;
  h: number;
}

export class Floor implements SceneElement {
  shapes: FloorShape[] = [];
  private bounds: Bounds;
  private rng: () => number;

  constructor(b: Bounds, rng: () => number) {
    this.rng = rng;
    this.bounds = { ...b };
    this.layout();
  }

  private layout(): void {
    const { width, height } = this.bounds;
    const n = Math.max(3, Math.round(width / 150));
    this.shapes = [];
    for (let i = 0; i < n; i++) {
      const kind = this.rng() < 0.7 ? "rock" : "wood";
      const rock = kind === "rock";
      const w = Math.min(width, rock ? 90 + this.rng() * 150 : 50 + this.rng() * 90);
      const h = Math.max(1, height * (rock ? 0.05 + this.rng() * 0.07 : 0.06 + this.rng() * 0.06));
      const x = this.rng() * (width - w);
      this.shapes.push({ kind, x, w, h });
    }
  }

  resize(b: Bounds): void {
    this.bounds = { ...b };
    this.layout();
  }

  update(_dt: number, _s: Stimulus): void {}

  draw(ctx: CanvasRenderingContext2D, l: Lighting): void {
    const mix = (a: number, c: number, t: number) => Math.round(a + (c - a) * t);
    const tint = (t: number) =>
      `rgb(${l.waterBottom.map((v, i) => mix(v, (l.plant[i] + l.ray[i]) / 2, t)).join(",")})`;
    const base = this.bounds.height;
    const sandH = base * 0.03;
    ctx.fillStyle = tint(0.3);
    for (const s of this.shapes) {
      ctx.beginPath();
      if (s.kind === "rock") {
        ctx.moveTo(s.x, base);
        ctx.quadraticCurveTo(s.x + s.w * 0.1, base - s.h, s.x + s.w * 0.5, base - s.h);
        ctx.quadraticCurveTo(s.x + s.w * 0.9, base - s.h, s.x + s.w, base);
      } else {
        // thin slanted piece of wood
        const t = Math.max(4, s.w * 0.14);
        ctx.moveTo(s.x, base);
        ctx.lineTo(s.x + s.w * 0.7, base - s.h);
        ctx.lineTo(s.x + s.w * 0.7 + t, base - s.h);
        ctx.lineTo(s.x + t * 1.5, base);
      }
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = tint(0.2);
    ctx.fillRect(0, base - sandH, this.bounds.width, sandH);
  }
}
