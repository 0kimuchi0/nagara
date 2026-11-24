import type { Lighting } from "../palette";
import { smooth } from "../audio/analysis";
import type { Bounds, SceneElement, Stimulus } from "./types";
import { drawJelly } from "./jellyDraw";
import { hazed } from "./depth";

const Y_MIN = 0.1;
const Y_MAX = 0.7;
/** 傘の開閉周期 (秒)。泳いでいる時は速く、休んでいる時はゆっくり */
const PERIOD_SWIM = 2.2;
const PERIOD_REST = 4.5;
/** 休んでいる時の開閉の大きさ (泳いでいる時を 1 とする) */
const REST_PULSE = 0.3;
/** 沈む速さ (傘の基準の大きさ / 秒)。泳いでいる時と休んでいる時 */
const SINK_SWIM = 0.3;
const SINK_REST = 0.5;
/** 泳ぐ/休むの切り替え: 画面の高さに対する位置と、続ける最長時間 (秒) */
const SWIM_UNTIL = 0.22;
const REST_UNTIL = 0.6;
const BOUT_MAX = 14;
/** 泳ぐ/休むの切り替えにかける時間の時定数 (秒) */
const VIGOR_TAU = 1.2;
/** 1 周期のうち、傘を閉じるのに使う割合。残りでゆっくり開く */
export const CONTRACT = 0.3;
/** 閉じる間に上へ進む最大の速さ (傘の基準の大きさ / 秒)。画面の大きさに合わせて伸び縮みする */
const THRUST = 2.6;
/** 推進の立ち上がりと、閉じ終えた後に惰性で進む時間の時定数 (秒) */
const GLIDE_ATTACK = 0.08;
const GLIDE_RELEASE = 0.45;

const ease = (x: number): number => 0.5 - 0.5 * Math.cos(Math.PI * x);
/** 周期内の位置 c (0..1、範囲外は折り返す) → 傘の閉じ具合 0..1 */
export function pulseCurve(c: number): number {
  const u = c - Math.floor(c);
  return u < CONTRACT ? ease(u / CONTRACT) : 1 - ease((u - CONTRACT) / (1 - CONTRACT));
}
/** 拍で加える上向き速度 (px/s) と、その減衰の時定数 (秒) */
const KICK = 130;
const KICK_TAU = 0.8;
/** 拍による収縮: 目標を保持する時間と、立ち上がり/戻りの時定数 */
const SQUEEZE_HOLD = 0.2;
const SQUEEZE_ATTACK = 0.06;
const SQUEEZE_RELEASE = 0.5;
/** なびき用速度の平滑化の時定数 (秒) */
const VEL_TAU = 0.4;
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
  /** 0 = 奥, 1 = 手前 */
  depth: number;
  kick: number;
  /** 傘を閉じて得た上向きの速さ (px/s)。閉じ終えた後も少し惰性で残る */
  glide: number;
  /** 泳いでいる (swim) か、休んで沈んでいる (rest) か */
  mode: "swim" | "rest";
  /** 今のモードを続けている時間 (秒) */
  modeTime: number;
  /** 0 = 休み 〜 1 = 泳ぎ。モードの切り替えをなめらかにする */
  vigor: number;
  squeeze: number;
  squeezeHold: number;
  pulse: number;
  velX: number;
  velY: number;
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

  get bodies(): ReadonlyArray<{ x: number; y: number; pulse: number; depth: number; scale: number }> {
    return this.jellies.map((j) => ({ x: j.x, y: j.y, pulse: j.pulse, depth: j.depth, scale: j.size }));
  }

  private make(index: number, total: number): Body {
    const { width, height } = this.bounds;
    const dir = this.rng() < 0.5 ? -1 : 1;
    const homeY = height * (0.35 + this.rng() * 0.25);
    const made: Body = {
      // 横方向に等間隔 + 少しのばらつき
      x: width * (0.15 + 0.7 * ((index + 0.5 + (this.rng() - 0.5) * 0.4) / total)),
      y: homeY,
      homeY,
      vx: dir * (8 + this.rng() * 12),
      phase: this.rng() * Math.PI * 2,
      driftPhase: this.rng() * Math.PI * 2,
      driftAmp: 2 + this.rng() * 2,
      size: 0.9 + this.rng() * 0.4,
      depth: 1,
      kick: 0,
      glide: 0,
      mode: "swim",
      modeTime: 0,
      vigor: 1,
      squeeze: 0,
      squeezeHold: 0,
      pulse: 0,
      velX: 0,
      velY: 0,
    };
    // 奥行きを匹ごとにずらす (index 順に奥→手前、少しばらつき)
    const depth = Math.min(1, 0.2 + 0.8 * ((index + 0.3 + this.rng() * 0.4) / total));
    const body = made;
    body.depth = depth;
    body.size *= 0.5 + 0.5 * depth; // 奥ほど小さい
    body.vx *= 0.45 + 0.55 * depth; // 奥ほどゆっくり (視差)
    body.driftAmp *= 0.5 + 0.5 * depth;
    return body;
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
    const prev = this.jellies.map((j) => [j.x, j.y]);
    for (const j of this.jellies) {
      if (s.beat) {
        j.kick = KICK;
        j.squeezeHold = SQUEEZE_HOLD;
      }
      j.squeezeHold = Math.max(0, j.squeezeHold - dt);
      const target = j.squeezeHold > 0 ? 1 : 0;
      j.squeeze = smooth(j.squeeze, target, dt, SQUEEZE_ATTACK, SQUEEZE_RELEASE);
      j.kick *= Math.exp(-dt / KICK_TAU);

      // 泳ぐ ⇄ 休む の切り替え: 上まで泳いだら休んで沈み、下まで沈んだらまた泳ぐ
      j.modeTime += dt;
      if (j.mode === "swim" && (j.y < height * SWIM_UNTIL || j.modeTime > BOUT_MAX)) {
        j.mode = "rest";
        j.modeTime = 0;
      } else if (j.mode === "rest" && (j.y > height * REST_UNTIL || j.modeTime > BOUT_MAX)) {
        j.mode = "swim";
        j.modeTime = 0;
      }
      j.vigor = smooth(j.vigor, j.mode === "swim" ? 1 : 0, dt, VIGOR_TAU, VIGOR_TAU);
      const vigor = j.vigor;
      const period = PERIOD_REST + (PERIOD_SWIM - PERIOD_REST) * vigor;
      const amp = REST_PULSE + (1 - REST_PULSE) * vigor;

      j.phase += (step * Math.PI * 2) / period;
      const cycle = j.phase / (Math.PI * 2);
      const base = pulseCurve(cycle) * amp;
      j.pulse = clamp(base + j.squeeze * (1 - base), 0, 1);
      // 閉じている最中に上へ押し出す (泳いでいる時ほど強い)。閉じ終えた後も惰性で少し進む
      const u = cycle - Math.floor(cycle);
      const unit = Math.min(width, height) / 14;
      const push =
        u < CONTRACT ? THRUST * vigor * vigor * unit * j.size * Math.sin((Math.PI * u) / CONTRACT) * speed : 0;
      j.glide = smooth(j.glide, push, dt, GLIDE_ATTACK, GLIDE_RELEASE);
      const sink = (SINK_REST + (SINK_SWIM - SINK_REST) * vigor) * unit * j.size * speed;

      // 上下: 推進と拍の kick で上へ、常にゆっくり沈む。小さな漂いを足す
      const vy = Math.sin(this.time * 0.6 + j.driftPhase) * j.driftAmp - j.kick * vigor - j.glide + sink;
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
    this.jellies.forEach((j, i) => {
      j.x = clamp(j.x, 0, width);
      if (dt > 0) {
        j.velX = smooth(j.velX, (j.x - prev[i][0]) / dt, dt, VEL_TAU, VEL_TAU);
        j.velY = smooth(j.velY, (j.y - prev[i][1]) / dt, dt, VEL_TAU, VEL_TAU);
      }
    });
  }

  draw(ctx: CanvasRenderingContext2D, l: Lighting): void {
    ctx.save();
    const baseGlow = clamp(l.jellyGlow * 0.7 + this.volume * 0.4, 0, 1);
    const unit = Math.min(this.bounds.width, this.bounds.height) / 14;
    const h = this.bounds.height || 1;
    // 奥の個体から描き、手前の個体が上に重なるようにする
    const order = [...this.jellies].sort((a, b) => a.depth - b.depth);
    for (const j of order) {
      drawJelly(
        ctx,
        { x: j.x, y: j.y, unit: unit * j.size, pulse: j.pulse, phase: j.phase, velX: j.velX, velY: j.velY },
        this.time,
        hazed(l.ray, l, j.y / h, j.depth, 0.4),
        baseGlow * (0.45 + 0.55 * j.depth),
      );
    }
    ctx.restore();
  }
}
