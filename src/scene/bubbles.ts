import type { Lighting } from "../palette";
import type { Bounds, SceneElement, Stimulus } from "./types";

export const MAX_BUBBLES = 120;
const BEAT_BURST = 8;
/** 基準の上昇速度 (px/s)。speed を掛けて使う */
const BASE_RISE = 120;

interface Bubble {
  x: number;
  y: number;
  r: number;
  vy: number;
  phase: number;
  wobble: number;
}

export class Bubbles implements SceneElement {
  private bubbles: Bubble[] = [];
  private bounds: Bounds;
  private spawnAcc = 0;
  private time = 0;

  private rng: () => number;

  constructor(b: Bounds, rng: () => number) {
    this.rng = rng;
    this.bounds = { ...b };
  }

  get count(): number {
    return this.bubbles.length;
  }

  get items(): ReadonlyArray<{ x: number; y: number; r: number }> {
    return this.bubbles;
  }

  resize(b: Bounds): void {
    this.bounds = { ...b };
  }

  private spawn(x: number): void {
    if (this.bubbles.length >= MAX_BUBBLES) return;
    const r = 2 + this.rng() * 5;
    this.bubbles.push({
      x,
      y: this.bounds.height + r,
      r,
      // 大きい泡ほどやや速い
      vy: BASE_RISE * (0.7 + this.rng() * 0.6) * (0.8 + r / 14),
      phase: this.rng() * Math.PI * 2,
      wobble: 4 + this.rng() * 8,
    });
  }

  update(dt: number, s: Stimulus): void {
    this.time += dt;
    const rate = 0.5 + Math.max(0, s.high) * 8;
    this.spawnAcc += rate * dt;
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      this.spawn(this.rng() * this.bounds.width);
    }
    if (s.beat) {
      const cx = this.rng() * this.bounds.width;
      for (let i = 0; i < BEAT_BURST; i++) this.spawn(cx + (this.rng() - 0.5) * 40);
    }
    const speed = Math.max(0, s.speed);
    for (const b of this.bubbles) {
      b.y -= b.vy * speed * dt;
      b.x += Math.sin(this.time * 1.5 + b.phase) * b.wobble * dt;
    }
    // 画面外に出た泡を、新しい配列を作らずその場で詰めて取り除く
    let w = 0;
    for (let i = 0; i < this.bubbles.length; i++) {
      const b = this.bubbles[i];
      if (b.y >= 0) this.bubbles[w++] = b;
    }
    this.bubbles.length = w;
  }

  draw(ctx: CanvasRenderingContext2D, l: Lighting): void {
    const [lr, lg, lb] = l.ray;
    const fill = `rgba(${lr},${lg},${lb},0.12)`;
    for (const b of this.bubbles) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = `rgba(255,255,255,0.45)`;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(b.x - b.r * 0.35, b.y - b.r * 0.35, Math.max(0.6, b.r * 0.25), 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.fill();
    }
  }
}
