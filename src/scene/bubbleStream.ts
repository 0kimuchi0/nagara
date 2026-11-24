import type { Lighting } from "../palette";
import { mixRGB } from "./depth";
import { drawBubble } from "./bubbleDraw";
import type { Bounds, SceneElement, Stimulus } from "./types";

/** エアストーンからの泡の最大数 */
export const MAX_STREAM_BUBBLES = 80;
/** 1 つのエアストーンから 1 秒に出る泡の数 */
const RATE = 7;
/** 泡が消える水面の高さ (画面の高さに対する比率) */
const SURFACE = 0.09;

interface StreamBubble {
  x: number;
  y: number;
  r: number;
  vy: number;
  /** 出てきたエアストーン */
  src: number;
  phase: number;
}

/**
 * 水槽のエアストーン: 底の決まった場所から、細かい泡が筋になって立ち昇る。
 * 泡は上がるほど少し速くなり、左右に小さく揺れる。
 */
export class BubbleStream implements SceneElement {
  /** エアストーンの横位置 (px) */
  sources: number[] = [];
  private nsources: number[] = [];
  private bubbles: StreamBubble[] = [];
  private bounds: Bounds;
  private rng: () => number;
  private acc: number[] = [];
  private time = 0;
  private ground: (x: number) => number = () => this.bounds.height;

  constructor(b: Bounds, rng: () => number) {
    this.rng = rng;
    this.bounds = { ...b };
    const n = 2;
    for (let i = 0; i < n; i++) this.nsources.push(0.15 + 0.7 * ((i + 0.2 + rng() * 0.6) / n));
    this.acc = this.nsources.map(() => 0);
    this.layout();
  }

  get items(): ReadonlyArray<{ x: number; y: number; r: number }> {
    return this.bubbles;
  }

  setGround(fn: (x: number) => number): void {
    this.ground = fn;
  }

  private layout(): void {
    this.sources = this.nsources.map((u) => u * this.bounds.width);
  }

  resize(b: Bounds): void {
    this.bounds = { ...b };
    this.layout();
    this.bubbles = [];
  }

  update(dt: number, s: Stimulus): void {
    const speed = Math.max(0.2, s.speed);
    this.time += dt;
    const top = this.bounds.height * SURFACE;
    for (let i = 0; i < this.sources.length; i++) {
      this.acc[i] += dt * RATE * (1 + 0.6 * Math.max(0, Math.min(1, s.high)));
      while (this.acc[i] >= 1) {
        this.acc[i] -= 1;
        if (this.bubbles.length >= MAX_STREAM_BUBBLES) continue;
        const x = this.sources[i];
        this.bubbles.push({
          x: x + (this.rng() - 0.5) * 4,
          y: this.ground(x),
          r: 1 + this.rng() * 2.2,
          vy: 30 + this.rng() * 20,
          src: i,
          phase: this.rng() * Math.PI * 2,
        });
      }
    }
    let w = 0;
    for (const b of this.bubbles) {
      // 上がるほど速くなる (浮力)。小さな泡ほどよく揺れる
      b.vy = Math.min(140, b.vy + 40 * dt);
      b.y -= b.vy * dt * speed;
      const src = this.sources[b.src] ?? b.x;
      b.x = src + Math.sin(this.time * 6 + b.phase) * (6 / b.r) + Math.sin(this.time * 1.3 + b.phase) * 4;
      if (b.y > top) this.bubbles[w++] = b;
    }
    this.bubbles.length = w;
  }

  draw(ctx: CanvasRenderingContext2D, l: Lighting): void {
    const light = mixRGB(l.ray, [255, 255, 255], 0.4);
    ctx.save();
    for (const b of this.bubbles) drawBubble(ctx, b.x, b.y, b.r, light, Math.sin(this.time * 9 + b.phase), 0.9);
    ctx.restore();
  }
}
