import type { Lighting } from "../palette";
import { smooth } from "../audio/analysis";
import type { Bounds, SceneElement, Stimulus } from "./types";

const Y_MIN = 0.1;
const Y_MAX = 0.7;
/** 傘の開閉周期 (秒) */
const PERIOD = 3;
/** 拍で加える上向き速度 (px/s) と、その減衰の時定数 (秒) */
const KICK = 130;
const KICK_TAU = 0.8;
/** 拍による収縮: 目標を保持する時間と、立ち上がり/戻りの時定数 */
const SQUEEZE_HOLD = 0.2;
const SQUEEZE_ATTACK = 0.06;
const SQUEEZE_RELEASE = 0.5;
/** 基準高さへ戻るばね定数 (1/s)。拍で上がっても沈んで戻る */
const HOME_SPRING = 1.2;
const TENTACLES = 5;
/** 傘どうしがこの倍率 x 傘の幅より近づくと、横方向に互いを押し離す */
const SEPARATION = 1.5;
/** 重なり率 1 のときの押し離し速度 (px/s) */
const REPEL_SPEED = 120;

interface Body {
  x: number;
  y: number;
  homeY: number;
  vx: number;
  phase: number;
  driftPhase: number;
  driftAmp: number;
  size: number;
  kick: number;
  squeeze: number;
  squeezeHold: number;
  pulse: number;
}

const countFor = (b: Bounds): number => (b.width < 600 ? 2 : 3);
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export class Jellyfish implements SceneElement {
  private jellies: Body[] = [];
  private bounds: Bounds;
  private rng: () => number;
  private time = 0;
  private volume = 0;

  constructor(b: Bounds, rng: () => number) {
    this.rng = rng;
    this.bounds = { ...b };
    const n = countFor(b);
    for (let i = 0; i < n; i++) this.jellies.push(this.make(i, n));
  }

  get bodies(): ReadonlyArray<{ x: number; y: number; pulse: number }> {
    return this.jellies;
  }

  private make(index: number, total: number): Body {
    const { width, height } = this.bounds;
    const dir = this.rng() < 0.5 ? -1 : 1;
    const homeY = height * (0.35 + this.rng() * 0.25);
    return {
      // 横方向に等間隔 + 少しのばらつき
      x: width * (0.15 + 0.7 * ((index + 0.5 + (this.rng() - 0.5) * 0.4) / total)),
      y: homeY,
      homeY,
      vx: dir * (8 + this.rng() * 12),
      phase: this.rng() * Math.PI * 2,
      driftPhase: this.rng() * Math.PI * 2,
      driftAmp: 6 + this.rng() * 6,
      size: 0.9 + this.rng() * 0.4,
      kick: 0,
      squeeze: 0,
      squeezeHold: 0,
      pulse: 0,
    };
  }

  /** 傘の半幅 (px) */
  private halfWidth(j: Body): number {
    return (Math.min(this.bounds.width, this.bounds.height) / 14) * j.size * 1.1;
  }

  private separate(dt: number): void {
    const unit = Math.min(this.bounds.width, this.bounds.height) / 14;
    for (let a = 0; a < this.jellies.length; a++) {
      for (let c = a + 1; c < this.jellies.length; c++) {
        const p = this.jellies[a];
        const q = this.jellies[c];
        if (Math.abs(p.y - q.y) > unit * 3) continue;
        const limit = SEPARATION * (this.halfWidth(p) + this.halfWidth(q));
        const dx = q.x - p.x;
        const dist = Math.abs(dx);
        if (dist >= limit) continue;
        const dir = dx === 0 ? (a % 2 === 0 ? 1 : -1) : Math.sign(dx);
        const push = REPEL_SPEED * (1 - dist / limit) * dt;
        p.x -= dir * push;
        q.x += dir * push;
      }
    }
  }

  private clampBody(j: Body): void {
    const { width, height } = this.bounds;
    j.x = clamp(j.x, 0, width);
    j.y = clamp(j.y, height * Y_MIN, height * Y_MAX);
  }

  resize(b: Bounds): void {
    const old = this.bounds;
    this.bounds = { ...b };
    const sx = old.width > 0 ? b.width / old.width : 1;
    const sy = old.height > 0 ? b.height / old.height : 1;
    for (const j of this.jellies) {
      j.x *= sx;
      j.y *= sy;
      j.homeY *= sy;
    }
    const n = countFor(b);
    if (this.jellies.length > n) this.jellies.length = n;
    while (this.jellies.length < n) this.jellies.push(this.make(this.jellies.length, n));
    this.jellies.forEach((j) => this.clampBody(j));
  }

  update(dt: number, s: Stimulus): void {
    const speed = Math.max(0, s.speed);
    const step = dt * speed;
    this.time += step;
    this.volume = s.volume;
    const { width, height } = this.bounds;
    for (const j of this.jellies) {
      if (s.beat) {
        j.kick = KICK;
        j.squeezeHold = SQUEEZE_HOLD;
      }
      j.squeezeHold = Math.max(0, j.squeezeHold - dt);
      const target = j.squeezeHold > 0 ? 1 : 0;
      j.squeeze = smooth(j.squeeze, target, dt, SQUEEZE_ATTACK, SQUEEZE_RELEASE);
      j.kick *= Math.exp(-dt / KICK_TAU);

      j.phase += (step * Math.PI * 2) / PERIOD;
      const base = 0.5 - 0.5 * Math.cos(j.phase);
      j.pulse = clamp(base * 0.5 + j.squeeze, 0, 1);

      // ゆるい上下の漂い (拍の kick は上向き)
      const vy = Math.sin(this.time * 0.6 + j.driftPhase) * j.driftAmp - j.kick - (j.y - j.homeY) * HOME_SPRING;
      j.x += j.vx * step;
      j.y += vy * dt;
      if (j.x < 0) {
        j.x = 0;
        j.vx = Math.abs(j.vx);
      } else if (j.x > width) {
        j.x = width;
        j.vx = -Math.abs(j.vx);
      }
      j.y = clamp(j.y, height * Y_MIN, height * Y_MAX);
    }
    this.separate(dt);
    for (const j of this.jellies) j.x = clamp(j.x, 0, width);
  }

  draw(ctx: CanvasRenderingContext2D, l: Lighting): void {
    ctx.save();
    const glow = clamp(l.jellyGlow * 0.7 + this.volume * 0.4, 0, 1);
    const [r, g, b] = l.ray;
    const unit = Math.min(this.bounds.width, this.bounds.height) / 14;
    for (const j of this.jellies) {
      const w = unit * j.size * (1.1 - 0.35 * j.pulse);
      const h = unit * j.size * (0.8 + 0.3 * j.pulse);
      const x = j.x;
      const y = j.y;

      // 発光
      const halo = ctx.createRadialGradient(x, y, 0, x, y, w * 2.2);
      halo.addColorStop(0, `rgba(${r},${g},${b},${0.35 * glow})`);
      halo.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(x, y, w * 2.2, 0, Math.PI * 2);
      ctx.fill();

      // 触手
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = `rgba(${r},${g},${b},${0.3 + 0.3 * glow})`;
      for (let i = 0; i < TENTACLES; i++) {
        const tx = x + ((i / (TENTACLES - 1)) * 2 - 1) * w * 0.7;
        const len = h * (2.2 + (i % 2) * 0.8);
        ctx.beginPath();
        ctx.moveTo(tx, y);
        const segs = 6;
        for (let k = 1; k <= segs; k++) {
          const t = k / segs;
          const sway = Math.sin(this.time * 1.6 + j.phase * 0.3 + i * 0.9 - t * 3) * w * 0.15 * t;
          ctx.lineTo(tx + sway, y + len * t);
        }
        ctx.stroke();
      }

      // 傘 (半楕円)
      ctx.beginPath();
      ctx.ellipse(x, y, w, h, 0, Math.PI, Math.PI * 2);
      ctx.closePath();
      ctx.fillStyle = `rgba(${r},${g},${b},${0.18 + 0.25 * glow})`;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = `rgba(255,255,255,${0.3 + 0.3 * glow})`;
      ctx.stroke();
    }
    ctx.restore();
  }
}
