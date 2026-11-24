import type { Lighting, RGB } from "../palette";
import type { Bounds, SceneElement, Stimulus } from "./types";
import { hazed, layerOf, mixRGB, scaleOf, type Layer } from "./depth";
import {
  drawContactShadow,
  drawLeaves,
  drawPebbles,
  drawRock,
  drawSubstrate,
  drawTufts,
  drawWood,
  hash,
  type GroundLook,
  type Pebble,
  type Tuft,
} from "./floorDraw";

export interface FloorShape {
  kind: "rock" | "wood";
  x: number;
  w: number;
  h: number;
  /** 0 = 奥, 1 = 手前 */
  depth: number;
  /** 置かれている床の y (奥ほど画面の上) */
  base: number;
  /** 輪郭の起伏や枝の付き方を決める 0..1 の数列 */
  form: ReadonlyArray<number>;
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
  form: number[];
}

/** 奥の床の高さ (画面の高さに対する比率)。手前の底床の起伏より上 (奥) にある */
const FAR_FLOOR_TOP = 0.85;
const FAR_FLOOR_BOTTOM = 0.885;
/** 手前の底床の厚み (画面の高さに対する比率) */
const SUBSTRATE = 0.1;
const MAX_H = 0.12;
const SPACING = 120;

export class Floor implements SceneElement {
  shapes: FloorShape[] = [];
  private seeds: FloorSeed[] = [];
  /** 底床の小石 (乱数を消費せず、種から決まる) */
  pebbles: Pebble[] = [];
  /** 前景草の茂み */
  tufts: Tuft[] = [];
  private leaves: Pebble[] = [];
  private bounds: Bounds;
  private rng: () => number;
  private time = 0;
  /** 底床の起伏の形を決める位相 */
  private terrain: [number, number, number];

  constructor(b: Bounds, rng: () => number) {
    this.rng = rng;
    this.bounds = { ...b };
    this.terrain = [rng() * 10, rng() * 10, rng() * 10];
    this.reflow();
  }

  /** 手前の底床の上の縁の y。ゆるやかに盛り上がったり下がったりする */
  terrainTop(x: number): number {
    const { width, height } = this.bounds;
    const u = x / Math.max(1, width);
    const [k1, k2, k3] = this.terrain;
    const t = 0.68 + 0.22 * Math.sin(u * 2.3 + k1) + 0.1 * Math.sin(u * 5.9 + k2) + 0.04 * Math.sin(u * 14.1 + k3);
    return height - height * SUBSTRATE * t;
  }

  /** 小石・茂み・落ち葉の配置を作り直す (位置は種と幅から決まり、乱数を消費しない) */
  private scatter(): void {
    const { width, height } = this.bounds;
    const seed = this.terrain[0];
    const n = Math.round(width / 6);
    this.pebbles = [];
    for (let i = 0; i < n; i++) {
      const x = hash(i * 3.17 + seed) * width;
      const v = hash(i * 5.71 + seed * 2);
      const top = this.terrainTop(x);
      const y = top + 1 + (height - 1 - top - 1) * Math.pow(v, 0.8);
      const r = (0.8 + 2.2 * hash(i * 7.3 + seed * 3)) * (0.45 + 0.9 * v);
      this.pebbles.push({ x, y, r, v, tone: hash(i * 11.1 + seed), tilt: (hash(i * 13.7 + seed) - 0.5) * 0.8 });
    }
    // 奥 (上) から手前 (下) の順に描けるよう並べる
    this.pebbles.sort((a, b) => a.y - b.y);
    const tn = Math.round(width / 60);
    this.tufts = [];
    for (let i = 0; i < tn; i++) {
      const x = ((i + 0.5 + (hash(i * 2.2 + seed * 5) - 0.5) * 0.8) / tn) * width;
      this.tufts.push({
        x,
        y: this.terrainTop(x) + 1,
        blades: 5 + Math.floor(hash(i * 4.4 + seed) * 4),
        len: 7 + hash(i * 6.6 + seed) * 9,
        seed: hash(i * 8.8 + seed),
      });
    }
    const ln = Math.max(2, Math.round(width / 250));
    this.leaves = [];
    for (let i = 0; i < ln; i++) {
      const x = hash(i * 9.9 + seed * 7) * width;
      const top = this.terrainTop(x);
      this.leaves.push({
        x,
        y: top + 3 + (height - top - 6) * hash(i * 3.3 + seed),
        r: 2.5 + hash(i * 1.9 + seed) * 2,
        v: 0.5,
        tone: 0,
        tilt: (hash(i * 4.1 + seed) - 0.5) * 2,
      });
    }
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
      const nw = rock ? 120 + this.rng() * 160 : 110 + this.rng() * 120;
      const nh = rock ? 0.07 + this.rng() * 0.05 : 0.08 + this.rng() * 0.04;
      const pos = this.rng();
      // 奥と手前を交互に置き、どちらの列も必ずできるようにする
      const far = this.seeds.length % 2 === 0;
      const depth = far ? this.rng() * 0.4 : 0.6 + this.rng() * 0.4;
      const form = Array.from({ length: 7 }, () => this.rng());
      this.seeds.push({ kind, nw, nh, pos, depth, form });
    }
  }

  private reflow(): void {
    const { width, height } = this.bounds;
    this.grow();
    this.shapes = this.seeds.slice(0, this.countFor(width)).map((sd) => {
      const sc = scaleOf(sd.depth);
      const w = Math.min(width, sd.nw * sc);
      const h = Math.max(1, Math.min(height * MAX_H, height * sd.nh * sc));
      const x = sd.pos * (width - w);
      // 手前の石は底床の上に少し埋まって置かれる。奥の石は奥の床の上
      const base =
        sd.depth >= 0.5
          ? this.terrainTop(x + w / 2) + h * 0.25
          : height * (FAR_FLOOR_TOP + (FAR_FLOOR_BOTTOM - FAR_FLOOR_TOP) * sd.depth * 2);
      return { kind: sd.kind, x, w, h, depth: sd.depth, base, form: sd.form };
    });
    this.scatter();
  }

  resize(b: Bounds): void {
    this.bounds = { ...b };
    this.reflow();
  }

  update(dt: number, s: Stimulus): void {
    this.time += dt * Math.max(0, s.speed);
  }

  draw(ctx: CanvasRenderingContext2D, l: Lighting): void {
    this.drawLayer(ctx, l, "far");
    this.drawLayer(ctx, l, "near");
  }

  /** 遠くの茂み: 奥の床の上に、水の色へ強くかすんだ低い起伏のシルエット */
  private drawDistantGrowth(ctx: CanvasRenderingContext2D, l: Lighting): void {
    const { width, height } = this.bounds;
    const floorY = height * FAR_FLOOR_TOP;
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
    const sand = mixRGB(l.waterBottom, mixRGB(l.plant, l.ray, 0.5), 0.28);
    if (layer === "far") {
      // 遠くの茂みの手前に、奥の床 (砂地) を敷く。奥ほど水の色にかすむ
      this.drawDistantGrowth(ctx, l);
      const top = height * FAR_FLOOR_TOP;
      const k = this.terrain[2];
      const farTop = (x: number) => top + height * 0.006 * Math.sin((x / Math.max(1, width)) * 3.1 + k);
      const step = Math.max(8, width / 120);
      ctx.beginPath();
      ctx.moveTo(0, height);
      for (let x = 0; x <= width + step; x += step) ctx.lineTo(Math.min(x, width), farTop(Math.min(x, width)));
      ctx.lineTo(width, height);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, top, 0, height);
      const far = hazed(sand, l, FAR_FLOOR_TOP, 0, 0.5);
      const nearer = hazed(sand, l, 1, 0.45, 0.5);
      g.addColorStop(0, `rgb(${far[0]},${far[1]},${far[2]})`);
      g.addColorStop(1, `rgb(${nearer[0]},${nearer[1]},${nearer[2]})`);
      ctx.fillStyle = g;
      ctx.fill();
    }
    const list = this.shapes.filter((s) => layerOf(s.depth) === layer).sort((a, b) => a.depth - b.depth);
    const mossBase: RGB = mixRGB(l.plant, l.waterBottom, 0.25);
    for (const s of list) {
      const yf = s.base / height;
      const look = {
        body: hazed(mixRGB(stone, [0, 0, 0], 0.12), l, yf, s.depth),
        light: hazed(mixRGB(l.ray, [255, 255, 255], 0.2), l, yf, s.depth),
        moss: hazed(mossBase, l, yf, s.depth),
      };
      if (layer === "far") {
        drawContactShadow(ctx, s.x + s.w / 2, s.base, s.w * 0.55, s.h * 0.12, hazed(sand, l, yf, s.depth), 0.6);
      }
      if (s.kind === "rock") drawRock(ctx, s.x, s.w, s.h, s.base, s.form, look, s.depth >= 0.5 && s.form[0] > 0.35);
      else drawWood(ctx, s.x, s.w, s.h, s.base, s.form, look);
    }
    if (layer === "near") {
      const ground: GroundLook = {
        sand,
        light: mixRGB(l.ray, [255, 255, 255], 0.2),
        grass: mixRGB(l.plant, [255, 255, 255], 0.08),
      };
      // 底床を石の手前に描いて、石の下の方を埋める
      drawSubstrate(ctx, width, height, (x) => this.terrainTop(x), ground, this.terrain[1]);
      // 足元の影: 石が底床に接する所
      for (const s of list) {
        const cx = s.x + s.w / 2;
        drawContactShadow(ctx, cx, s.base - s.h * 0.25, s.w * 0.55, s.h * 0.14, sand, 1);
      }
      drawPebbles(ctx, this.pebbles, ground);
      drawLeaves(ctx, this.leaves, ground);
      drawTufts(ctx, this.tufts, ground, this.time);
    }
  }
}
