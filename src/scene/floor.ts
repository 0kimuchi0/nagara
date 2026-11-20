import type { Lighting } from "../palette";
import type { Bounds, SceneElement, Stimulus } from "./types";

export interface FloorShape {
  kind: "rock" | "wood";
  x: number;
  w: number;
  h: number;
}

interface FloorSeed {
  kind: "rock" | "wood";
  /** 基準の幅 (px) */
  nw: number;
  /** 高さに対する比率 */
  nh: number;
  /** 0..1: 配置可能範囲 (width - w) 内での位置 */
  pos: number;
}

export class Floor implements SceneElement {
  shapes: FloorShape[] = [];
  private seeds: FloorSeed[] = [];
  private bounds: Bounds;
  private rng: () => number;

  constructor(b: Bounds, rng: () => number) {
    this.rng = rng;
    this.bounds = { ...b };
    this.layout();
  }

  /** 乱数は種を作る時だけ引く。リサイズでは既存の種を使い回し、足りない分だけ足す */
  private grow(): void {
    const n = Math.max(3, Math.round(this.bounds.width / 150));
    while (this.seeds.length < n) {
      const kind = this.rng() < 0.7 ? "rock" : "wood";
      const rock = kind === "rock";
      this.seeds.push({
        kind,
        nw: rock ? 90 + this.rng() * 150 : 50 + this.rng() * 90,
        nh: rock ? 0.05 + this.rng() * 0.07 : 0.06 + this.rng() * 0.06,
        pos: this.rng(),
      });
    }
  }

  private reflow(): void {
    const { width, height } = this.bounds;
    this.grow();
    const n = Math.max(3, Math.round(width / 150));
    this.shapes = this.seeds.slice(0, n).map((sd) => {
      const w = Math.min(width, sd.nw);
      const h = Math.max(1, height * sd.nh);
      return { kind: sd.kind, x: sd.pos * (width - w), w, h };
    });
  }

  private layout(): void {
    this.reflow();
  }

  resize(b: Bounds): void {
    this.bounds = { ...b };
    this.reflow();
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
