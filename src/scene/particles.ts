import type { Lighting } from "../palette";
import type { Bounds, SceneElement, Stimulus } from "./types";

export const PARTICLE_COUNT = 60;

interface Particle {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  phase: number;
}

export class Particles implements SceneElement {
  private ps: Particle[] = [];
  private bounds: Bounds;
  private time = 0;
  private volume = 0;

  constructor(b: Bounds, rng: () => number) {
    this.bounds = { ...b };
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      this.ps.push({
        x: rng() * b.width,
        y: rng() * b.height,
        r: 0.6 + rng() * 1.6,
        vx: (rng() - 0.5) * 8,
        vy: (rng() - 0.5) * 5,
        phase: rng() * Math.PI * 2,
      });
    }
  }

  get items(): ReadonlyArray<{ x: number; y: number; r: number }> {
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
      p.x += (p.vx + Math.sin(this.time * 0.4 + p.phase) * 3) * speed * dt;
      p.y += (p.vy + Math.cos(this.time * 0.3 + p.phase) * 2) * speed * dt;
      // 端で反対側へ回り込む
      p.x = w > 0 ? ((p.x % w) + w) % w : 0;
      p.y = h > 0 ? ((p.y % h) + h) % h : 0;
    }
  }

  draw(ctx: CanvasRenderingContext2D, l: Lighting): void {
    const [r, g, b] = l.ray;
    // volume は平滑化済みの前提。急変させない
    const alpha = 0.15 + Math.min(1, Math.max(0, this.volume)) * 0.35;
    ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
    for (const p of this.ps) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
