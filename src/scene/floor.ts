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
      const w = Math.min(width, 60 + this.rng() * 140);
      const h = Math.max(1, height * 0.25 * (0.3 + this.rng() * 0.7));
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
    const [r, g, b] = l.waterBottom.map((v) => Math.round(v * 0.35));
    const base = this.bounds.height;
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, base - 6, this.bounds.width, 6);
    for (const s of this.shapes) {
      ctx.beginPath();
      if (s.kind === "rock") {
        ctx.moveTo(s.x, base);
        ctx.quadraticCurveTo(s.x + s.w * 0.1, base - s.h, s.x + s.w * 0.5, base - s.h);
        ctx.quadraticCurveTo(s.x + s.w * 0.9, base - s.h, s.x + s.w, base);
      } else {
        ctx.moveTo(s.x, base);
        ctx.lineTo(s.x + s.w * 0.15, base - s.h);
        ctx.lineTo(s.x + s.w * 0.85, base - s.h * 0.6);
        ctx.lineTo(s.x + s.w, base);
      }
      ctx.closePath();
      ctx.fill();
    }
  }
}
