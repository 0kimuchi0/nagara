import type { Lighting } from "../palette";
import { smooth } from "../audio/analysis";
import type { Bounds, SceneElement, Stimulus } from "./types";
import { hazed, layerOf, scaleOf, type Layer } from "./depth";
import { drawRibbon, drawStem, drawSword, type PlantKind, type Spine } from "./plantDraw";
import type { RGB } from "../palette";

const SPACING = 40;

interface Plant {
  /** 0..1 (幅に対する比率) */
  nx: number;
  /** 高さに対する比率 */
  nheight: number;
  freq: number;
  phase: number;
  width: number;
  /** 0 = 奥, 1 = 手前 */
  depth: number;
  kind: PlantKind;
  /** 見た目のばらつき用 0..1 */
  seed: number;
}

/** 種類ごとの高さの倍率 (剣状の葉は低く広がる) */
const KIND_HEIGHT: Record<PlantKind, number> = { ribbon: 1.15, stem: 0.8, sword: 0.5 };

/** 奥の株ほど床の奥 (画面ではやや上) に生える */
const FLOOR_DEPTH = 0.05;

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
    return this.plants.map((p) => p.nx * this.bounds.width);
  }

  /** 本数を round(width/40) に合わせる。既存の株はそのまま残し、増減だけ行う */
  private layout(): void {
    const n = Math.round(this.bounds.width / SPACING);
    if (this.plants.length > n) this.plants.length = n;
    while (this.plants.length < n) {
      this.plants.push({
        nx: this.rng(),
        nheight: 0.15 + this.rng() * 0.3,
        freq: 0.5 + this.rng() * 0.6,
        phase: this.rng() * Math.PI * 2,
        width: 3 + this.rng() * 4,
        depth: this.rng(),
        ...this.pickKind(),
      });
    }
  }

  private pickKind(): { kind: PlantKind; seed: number } {
    const r = this.rng();
    const kind: PlantKind = r < 0.5 ? "ribbon" : r < 0.8 ? "stem" : "sword";
    return { kind, seed: this.rng() };
  }

  get kinds(): ReadonlyArray<PlantKind> {
    return this.plants.map((p) => p.kind);
  }

  private heightOf(p: Plant): number {
    return p.nheight * this.bounds.height * scaleOf(p.depth) * KIND_HEIGHT[p.kind];
  }

  private widthOf(p: Plant): number {
    // 手前ほど急に太くなる (奥 0.35 倍 〜 手前 1.85 倍)
    return p.width * (0.35 + 1.5 * p.depth * p.depth);
  }

  private baseOf(p: Plant): number {
    return this.bounds.height * (1 - FLOOR_DEPTH * (1 - p.depth));
  }

  /** テスト・確認用: 各株の奥行きと見かけの高さ・太さ */
  get stalks(): ReadonlyArray<{ depth: number; height: number; width: number }> {
    return this.plants.map((p) => ({ depth: p.depth, height: this.heightOf(p), width: this.widthOf(p) }));
  }

  /** 先端の横ずれ。節 t(0..1) では t^2 で先端ほど大きくなる */
  private offsetAt(p: Plant, t: number): number {
    const amp = this.heightOf(p) * (0.06 + 0.25 * this.sway);
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
    this.drawLayer(ctx, l, "far");
    this.drawLayer(ctx, l, "near");
  }

  drawLayer(ctx: CanvasRenderingContext2D, l: Lighting, layer: Layer): void {
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    // 奥から順に描く
    const order = this.plants.filter((p) => layerOf(p.depth) === layer).sort((a, b) => a.depth - b.depth);
    for (const p of order) {
      const px = p.nx * this.bounds.width;
      const ph = this.heightOf(p);
      const base = this.baseOf(p);
      const yMid = (base - ph * 0.5) / this.bounds.height;
      const shade = (0.8 + 0.2 * Math.sin(p.phase)) * (0.85 + 0.25 * p.depth);
      const tone = this.toneOf(p, l.plant);
      const lit: RGB = [Math.min(255, tone[0] * shade), Math.min(255, tone[1] * shade), Math.min(255, tone[2] * shade)];
      const color = hazed(lit, l, yMid, p.depth);
      const tip = hazed(this.tipOf(p, lit), l, yMid, p.depth);
      const look = { color, tip, alpha: 0.6 + 0.35 * p.depth, width: this.widthOf(p) * 1.6 };
      const spine: Spine = (t) => [px + this.offsetAt(p, t), base - ph * t];
      if (p.kind === "ribbon") drawRibbon(ctx, spine, look);
      else if (p.kind === "stem") drawStem(ctx, spine, look, this.time * p.freq + p.phase);
      else drawSword(ctx, [px, base], ph, look, this.offsetAt(p, 1) / Math.max(1, ph), p.seed);
    }
  }

  /** 種類ごとの基本の色合い (照明の水草色を少しずらす) */
  private toneOf(p: Plant, c: RGB): RGB {
    if (p.kind === "stem") return [c[0] * 1.1 + 12, c[1] * 1.02, c[2] * 0.85]; // 黄緑寄り
    if (p.kind === "sword") return [c[0] * 0.8, c[1] * 0.92, c[2] * 0.9]; // 深い緑
    return c;
  }

  /** 先端の色。有茎草は赤み、それ以外は明るく。明るさは照明に比例させ、夜に浮かないようにする */
  private tipOf(p: Plant, c: RGB): RGB {
    if (p.kind === "stem") return [Math.min(255, c[0] * 1.7 + 20), c[1] * 0.75, c[2] * 0.8];
    return [Math.min(255, c[0] * 1.15), Math.min(255, c[1] * 1.15), Math.min(255, c[2] * 1.1)];
  }
}
