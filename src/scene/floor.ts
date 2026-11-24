import type { Lighting, RGB } from "../palette";
import type { Bounds, SceneElement, Stimulus } from "./types";
import { hazed, layerOf, mixRGB, scaleOf, type Layer } from "./depth";

export interface FloorShape {
  kind: "rock" | "wood";
  x: number;
  w: number;
  h: number;
  /** 0 = 奥, 1 = 手前 */
  depth: number;
  /** 置かれている床の y (奥ほど画面の上) */
  base: number;
}

interface FloorSeed {
  kind: "rock" | "wood";
  /** 基準の幅 (px) */
  nw: number;
  /** 高さに対する比率 */
  nh: number;
  /** 0..1: 配置可能範囲 (width - w) 内での位置 */
  pos: number;
  depth: number;
}

/** 奥の床が画面上でどれだけ上にあるか (高さに対する比率) */
const FLOOR_DEPTH = 0.05;
const MAX_H = 0.12;
const SPACING = 120;

export class Floor implements SceneElement {
  shapes: FloorShape[] = [];
  private seeds: FloorSeed[] = [];
  private bounds: Bounds;
  private rng: () => number;

  constructor(b: Bounds, rng: () => number) {
    this.rng = rng;
    this.bounds = { ...b };
    this.reflow();
  }

  private countFor(width: number): number {
    return Math.max(4, Math.round(width / SPACING));
  }

  /** 乱数は種を作る時だけ引く。リサイズでは既存の種を使い回し、足りない分だけ足す */
  private grow(): void {
    const n = this.countFor(this.bounds.width);
    while (this.seeds.length < n) {
      const kind = this.rng() < 0.7 ? "rock" : "wood";
      const rock = kind === "rock";
      const nw = rock ? 90 + this.rng() * 150 : 50 + this.rng() * 90;
      const nh = rock ? 0.05 + this.rng() * 0.07 : 0.06 + this.rng() * 0.06;
      const pos = this.rng();
      // 奥と手前を交互に置き、どちらの列も必ずできるようにする
      const far = this.seeds.length % 2 === 0;
      const depth = far ? this.rng() * 0.4 : 0.6 + this.rng() * 0.4;
      this.seeds.push({ kind, nw, nh, pos, depth });
    }
  }

  private reflow(): void {
    const { width, height } = this.bounds;
    this.grow();
    this.shapes = this.seeds.slice(0, this.countFor(width)).map((sd) => {
      const sc = scaleOf(sd.depth);
      const w = Math.min(width, sd.nw * sc);
      const h = Math.max(1, Math.min(height * MAX_H, height * sd.nh * sc));
      const base = sd.depth >= 0.5 ? height : height * (1 - FLOOR_DEPTH * (1 - sd.depth * 2));
      return { kind: sd.kind, x: sd.pos * (width - w), w, h, depth: sd.depth, base };
    });
  }

  resize(b: Bounds): void {
    this.bounds = { ...b };
    this.reflow();
  }

  update(_dt: number, _s: Stimulus): void {}

  draw(ctx: CanvasRenderingContext2D, l: Lighting): void {
    this.drawLayer(ctx, l, "far");
    this.drawLayer(ctx, l, "near");
  }

  /** 遠くの茂み: 奥の床の上に、水の色へ強くかすんだ低い起伏のシルエット */
  private drawDistantGrowth(ctx: CanvasRenderingContext2D, l: Lighting): void {
    const { width, height } = this.bounds;
    const floorY = height * (1 - FLOOR_DEPTH);
    const k = this.seeds.length > 0 ? this.seeds[0].pos * 10 : 0; // 形は種から決まる (乱数を消費しない)
    const ridge = (x: number) => {
      const u = x / Math.max(1, width);
      return (
        height *
        (0.06 +
          0.035 * Math.sin(u * 7.1 + k) +
          0.02 * Math.sin(u * 17.3 + k * 2.3) +
          0.012 * Math.sin(u * 41.7 + k * 0.7))
      );
    };
    const c = hazed(mixRGB(l.plant, l.waterBottom, 0.3), l, 0.85, 0, 0.8);
    const g = ctx.createLinearGradient(0, floorY - height * 0.12, 0, floorY);
    g.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},0.25)`);
    g.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0.55)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, height);
    const step = Math.max(8, width / 120);
    for (let x = 0; x <= width + step; x += step) ctx.lineTo(Math.min(x, width), floorY - ridge(x));
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fill();
  }

  drawLayer(ctx: CanvasRenderingContext2D, l: Lighting, layer: Layer): void {
    const { width, height } = this.bounds;
    const stone: RGB = mixRGB(l.waterBottom, mixRGB(l.plant, l.ray, 0.5), 0.3);
    const fill = (c: RGB) => `rgb(${c[0]},${c[1]},${c[2]})`;
    if (layer === "far") {
      // 奥の床: 画面下部へ向かってかすむ帯
      const top = height * (1 - FLOOR_DEPTH);
      const g = ctx.createLinearGradient(0, top, 0, height);
      const c0 = hazed(stone, l, 1 - FLOOR_DEPTH, 0.1);
      g.addColorStop(0, `rgba(${c0[0]},${c0[1]},${c0[2]},0)`);
      g.addColorStop(1, `rgba(${c0[0]},${c0[1]},${c0[2]},0.6)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, top, width, height - top);
      this.drawDistantGrowth(ctx, l);
    }
    const list = this.shapes.filter((s) => layerOf(s.depth) === layer).sort((a, b) => a.depth - b.depth);
    for (const s of list) {
      ctx.fillStyle = fill(hazed(stone, l, s.base / height, s.depth));
      ctx.beginPath();
      if (s.kind === "rock") {
        ctx.moveTo(s.x, s.base);
        ctx.quadraticCurveTo(s.x + s.w * 0.1, s.base - s.h, s.x + s.w * 0.5, s.base - s.h);
        ctx.quadraticCurveTo(s.x + s.w * 0.9, s.base - s.h, s.x + s.w, s.base);
      } else {
        // 細く斜めの流木
        const t = Math.max(3, s.w * 0.14);
        ctx.moveTo(s.x, s.base);
        ctx.lineTo(s.x + s.w * 0.7, s.base - s.h);
        ctx.lineTo(s.x + s.w * 0.7 + t, s.base - s.h);
        ctx.lineTo(s.x + t * 1.5, s.base);
      }
      ctx.closePath();
      ctx.fill();
    }
    if (layer === "near") {
      const sandH = height * 0.03;
      ctx.fillStyle = fill(mixRGB(l.waterBottom, mixRGB(l.plant, l.ray, 0.5), 0.2));
      ctx.fillRect(0, height - sandH, width, sandH);
    }
  }
}
