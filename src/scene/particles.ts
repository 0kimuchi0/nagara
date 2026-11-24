import type { Lighting } from "../palette";
import type { Bounds, SceneElement, Stimulus } from "./types";
import { hazed, layerOf, type Layer } from "./depth";

export const PARTICLE_COUNT = 60;

interface Particle {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  phase: number;
  /** 0 = 奥, 1 = 手前 */
  depth: number;
}

export class Particles implements SceneElement {
  private ps: Particle[] = [];
  private bounds: Bounds;
  private time = 0;
  private volume = 0;

  constructor(b: Bounds, rng: () => number) {
    this.bounds = { ...b };
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const x = rng() * b.width;
      const y = rng() * b.height;
      const r0 = 0.6 + rng() * 1.0;
      const vx = (rng() - 0.5) * 8;
      const vy = (rng() - 0.5) * 5;
      const phase = rng() * Math.PI * 2;
      // 奥の粒を多めにして、手前の大きな粒はまばらにする
      const depth = Math.pow(rng(), 1.4);
      this.ps.push({ x, y, r: r0 * (0.5 + depth * 2.4), vx, vy, phase, depth });
    }
  }

  get items(): ReadonlyArray<{ x: number; y: number; r: number; depth: number }> {
    return this.ps;
  }

  resize(b: Bounds): void {
    this.bounds = { ...b };
    for (const p of this.ps) {
      p.x = Math.min(p.x, b.width);
      p.y = Math.min(p.y, b.height);
    }
  }

  update(dt: number, s: Stimulus): void {
    this.time += dt;
    this.volume = s.volume;
    const { width: w, height: h } = this.bounds;
    const speed = Math.max(0, s.speed);
    for (const p of this.ps) {
      // 手前ほど速く流れて見える (視差)
      const par = 0.35 + 1.1 * p.depth;
      p.x += (p.vx + Math.sin(this.time * 0.4 + p.phase) * 3) * speed * par * dt;
      p.y += (p.vy + Math.cos(this.time * 0.3 + p.phase) * 2) * speed * par * dt;
      // 端で反対側へ回り込む
      p.x = w > 0 ? ((p.x % w) + w) % w : 0;
      p.y = h > 0 ? ((p.y % h) + h) % h : 0;
    }
  }

  draw(ctx: CanvasRenderingContext2D, l: Lighting): void {
    this.drawLayer(ctx, l, "far");
    this.drawLayer(ctx, l, "near");
  }

  drawLayer(ctx: CanvasRenderingContext2D, l: Lighting, layer: Layer): void {
    // volume は平滑化済みの前提。急変させない
    const v = Math.min(1, Math.max(0, this.volume));
    const h = this.bounds.height || 1;
    for (const p of this.ps) {
      if (layerOf(p.depth) !== layer) continue;
      const [r, g, b] = hazed(l.ray, l, p.y / h, p.depth, 0.5);
      // 奥は小さくかすかに、手前は大きくぼんやりと (中心が明るく縁が薄い)
      const a = (0.1 + v * 0.3) * (0.6 + 0.6 * p.depth) * (p.depth > 0.75 ? 0.6 : 1);
      ctx.fillStyle = `rgba(${r},${g},${b},${Math.min(1, a).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
