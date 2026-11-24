import type { Lighting, RGB } from "../palette";
import { hazed, mixRGB } from "./depth";
import type { Bounds, SceneElement, Stimulus } from "./types";

const CLOUDS = 9;
const KELP = 6;
const SNOW = 150;
/** 遠くの海藻が生える奥の床の高さ (画面の高さに対する比率) */
const FAR_FLOOR = 0.86;

const rgba = (c: RGB, a: number): string =>
  `rgba(${c[0]},${c[1]},${c[2]},${Math.min(1, Math.max(0, a)).toFixed(3)})`;
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

export interface Cloud {
  x: number;
  y: number;
  r: number;
  vx: number;
  /** 明るいむらか暗いむらか */
  light: boolean;
  phase: number;
}

export interface Kelp {
  x: number;
  base: number;
  height: number;
  width: number;
  phase: number;
  freq: number;
}

export interface Snow {
  x: number;
  y: number;
  r: number;
  /** 0 = 奥 〜 1 = 手前 */
  depth: number;
  phase: number;
}

/**
 * 水そのもの:
 * - ゆっくり流れる濁りのむら (明暗の大きなぼかし)
 * - 水面のすぐ下の光の散乱 (明るいかすみ) と、深いほど暗く沈む水
 * - はるか奥でかすんで揺れる海藻のシルエット
 * - ゆっくり沈んでいくマリンスノー (手前ほど大きく速い)
 */
export class WaterVolume implements SceneElement {
  clouds: Cloud[] = [];
  kelp: Kelp[] = [];
  snow: Snow[] = [];
  private bounds: Bounds;
  private time = 0;
  private volume = 0;

  constructor(b: Bounds, rng: () => number) {
    this.bounds = { ...b };
    const { width: W, height: H } = b;
    const m = Math.min(W, H);
    for (let i = 0; i < CLOUDS; i++) {
      this.clouds.push({
        x: rng() * W,
        y: H * (0.15 + 0.65 * rng()),
        r: m * (0.25 + 0.25 * rng()),
        vx: (rng() < 0.5 ? -1 : 1) * (4 + rng() * 6),
        light: i % 2 === 0,
        phase: rng() * Math.PI * 2,
      });
    }
    for (let i = 0; i < KELP; i++) {
      this.kelp.push({
        x: W * ((i + 0.2 + rng() * 0.6) / KELP),
        base: H * FAR_FLOOR,
        height: H * (0.3 + 0.3 * rng()),
        width: 6 + rng() * 8,
        phase: rng() * Math.PI * 2,
        freq: 0.25 + rng() * 0.25,
      });
    }
    for (let i = 0; i < SNOW; i++) {
      const depth = Math.pow(rng(), 1.5);
      this.snow.push({ x: rng() * W, y: rng() * H, r: 0.4 + depth * 1.4 + rng() * 0.3, depth, phase: rng() * Math.PI * 2 });
    }
  }

  resize(b: Bounds): void {
    const sx = this.bounds.width > 0 ? b.width / this.bounds.width : 1;
    const sy = this.bounds.height > 0 ? b.height / this.bounds.height : 1;
    for (const c of this.clouds) {
      c.x *= sx;
      c.y *= sy;
    }
    for (const k of this.kelp) {
      k.x *= sx;
      k.base = b.height * FAR_FLOOR;
      k.height *= sy;
    }
    for (const s of this.snow) {
      s.x *= sx;
      s.y *= sy;
    }
    this.bounds = { ...b };
  }

  update(dt: number, st: Stimulus): void {
    const speed = Math.max(0, st.speed);
    const step = dt * speed;
    this.time += step;
    this.volume = st.volume;
    const { width: W, height: H } = this.bounds;
    for (const c of this.clouds) {
      c.x += c.vx * step;
      if (c.x < -c.r) c.x += W + 2 * c.r;
      else if (c.x > W + c.r) c.x -= W + 2 * c.r;
    }
    for (const s of this.snow) {
      // 手前ほど速く沈む (視差)。わずかに左右へ漂う
      s.y += (3 + 14 * s.depth) * step;
      s.x += Math.sin(this.time * 0.7 + s.phase) * (2 + 4 * s.depth) * step;
      if (s.y > H) s.y -= H;
      if (s.x < 0) s.x += W;
      else if (s.x > W) s.x -= W;
    }
  }

  draw(ctx: CanvasRenderingContext2D, l: Lighting): void {
    const { width: W, height: H } = this.bounds;
    const k = Math.min(1, l.rayIntensity * 1.2);
    const light = mixRGB(l.ray, [255, 255, 255], 0.3);
    const deep = mixRGB(l.waterBottom, [0, 10, 30], 0.45);
    ctx.save();

    // はるか奥の海藻: 根元から先へ細くなる帯に、葉が左右に付く。水の色に強くかすむ
    const kelpColor = hazed(mixRGB(l.plant, l.waterBottom, 0.3), l, 0.6, 0, 0.88);
    for (const kp of this.kelp) {
      const N = 16;
      const pts: Array<[number, number]> = [];
      for (let n = 0; n <= N; n++) {
        const t = n / N;
        const sway =
          Math.sin(this.time * kp.freq + kp.phase + t * 2.4) * 34 * t * t +
          Math.sin(this.time * kp.freq * 1.7 + kp.phase * 2 + t * 5) * 6 * t;
        pts.push([kp.x + sway, kp.base - kp.height * t]);
      }
      // 茎: 帯として塗る (根元が太く先が細い)
      ctx.fillStyle = rgba(kelpColor, 0.32);
      ctx.beginPath();
      for (let n = 0; n <= N; n++) {
        const w = (kp.width / 2) * (1 - 0.8 * (n / N));
        if (n === 0) ctx.moveTo(pts[n][0] - w, pts[n][1]);
        else ctx.lineTo(pts[n][0] - w, pts[n][1]);
      }
      for (let n = N; n >= 0; n--) ctx.lineTo(pts[n][0] + (kp.width / 2) * (1 - 0.8 * (n / N)), pts[n][1]);
      ctx.closePath();
      ctx.fill();
      // 葉: 茎の途中から斜め上へ、左右交互に
      ctx.fillStyle = rgba(kelpColor, 0.26);
      for (let n = 2; n < N; n += 2) {
        const t = n / N;
        const [x, y] = pts[n];
        const side = n % 4 === 0 ? 1 : -1;
        const len = kp.width * (2.6 - 1.4 * t);
        const ang = -Math.PI / 2 + side * (0.9 - 0.3 * t) + Math.sin(this.time * kp.freq + n) * 0.15;
        ctx.beginPath();
        ctx.ellipse(x + Math.cos(ang) * len * 0.5, y + Math.sin(ang) * len * 0.5, len * 0.5, kp.width * 0.28, ang, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 濁りのむら: 明るいむらと暗いむらが大きくぼんやり流れる
    for (const c of this.clouds) {
      const breathe = 0.7 + 0.3 * Math.sin(this.time * 0.2 + c.phase);
      const col = c.light ? light : deep;
      const a = (c.light ? 0.05 * (0.4 + 0.6 * k) : 0.06) * breathe;
      const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.r);
      g.addColorStop(0, rgba(col, a));
      g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g;
      ctx.fillRect(c.x - c.r, c.y - c.r, c.r * 2, c.r * 2);
    }

    // 水面のすぐ下: 光が散乱して明るくかすむ
    const top = ctx.createLinearGradient(0, H * 0.06, 0, H * 0.42);
    top.addColorStop(0, rgba(light, (0.16 + 0.04 * clamp01(this.volume)) * k));
    top.addColorStop(1, rgba(light, 0));
    ctx.fillStyle = top;
    ctx.fillRect(0, H * 0.06, W, H * 0.36);

    // 深いところ: 暗く青く沈む
    const low = ctx.createLinearGradient(0, H * 0.5, 0, H);
    low.addColorStop(0, rgba(deep, 0));
    low.addColorStop(1, rgba(deep, 0.28));
    ctx.fillStyle = low;
    ctx.fillRect(0, H * 0.5, W, H * 0.5);

    // マリンスノー
    for (const s of this.snow) {
      const c = hazed(mixRGB(light, l.waterTop, 0.3), l, s.y / Math.max(1, H), s.depth, 0.5);
      ctx.fillStyle = rgba(c, (0.12 + 0.3 * s.depth) * (0.5 + 0.5 * k));
      ctx.fillRect(s.x, s.y, s.r, s.r * (1 + 0.4 * Math.sin(s.phase)));
    }
    ctx.restore();
  }
}
