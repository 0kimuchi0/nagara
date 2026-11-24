import type { Lighting, RGB } from "../palette";
import { mixRGB } from "./depth";
import type { Bounds, SceneElement, Stimulus } from "./types";

/** 水面の帯の高さ (画面の高さに対する比率) */
export const SURFACE_BAND = 0.1;
/** 波の網目のセルの数 */
const CELLS = 56;
const CELL_POINTS = 22;
/** 波の照り返しの線の数 */
const SHEEN_LINES = 5;
/** きらめきの数 */
const GLINTS = 40;

const rgba = (c: RGB, a: number): string =>
  `rgba(${c[0]},${c[1]},${c[2]},${Math.min(1, Math.max(0, a)).toFixed(3)})`;
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const hash = (i: number): number => {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

export interface SurfaceCell {
  /** 0..1 横位置 */
  u: number;
  /** 0 = 手前 (画面の上端) 〜 1 = 奥 (水面の帯の下端) */
  v: number;
  /** 手前のときの基準の半径 (px) */
  r: number;
  phase: number;
  speed: number;
  drift: number;
}

interface Sheen {
  freq: number;
  freq2: number;
  speed: number;
  phase: number;
}

/**
 * 水中から見上げた水面。
 * - 波の網目: 手前 (上) ほど大きく、奥 (下) ほど小さく平たい
 * - 波の谷のうっすらとした陰影で、起伏を感じさせる
 * - 太陽の方向だけ明るく抜ける光の窓 (ゆっくり揺れ動く)
 * - 波の照り返しの線、帯の下端の境目のゆらぎ、一瞬光るきらめき
 */
export class WaterSurface implements SceneElement {
  cells: SurfaceCell[] = [];
  private sheens: Sheen[] = [];
  private bounds: Bounds;
  private time = 0;
  private volume = 0;
  private sunPhase: number;

  constructor(b: Bounds, rng: () => number) {
    this.bounds = { ...b };
    this.sunPhase = rng() * Math.PI * 2;
    for (let i = 0; i < CELLS; i++) {
      this.cells.push({
        u: rng(),
        v: (i + rng()) / CELLS, // 帯の上から下まで満遍なく
        r: 46 + rng() * 30,
        phase: rng() * Math.PI * 2,
        speed: 0.45 + rng() * 0.5,
        drift: (rng() - 0.5) * 0.03,
      });
    }
    for (let i = 0; i < SHEEN_LINES; i++) {
      this.sheens.push({ freq: 3 + rng() * 4, freq2: 9 + rng() * 8, speed: 0.3 + rng() * 0.4, phase: rng() * Math.PI * 2 });
    }
  }

  resize(b: Bounds): void {
    this.bounds = { ...b };
  }

  update(dt: number, s: Stimulus): void {
    const step = dt * Math.max(0, s.speed);
    this.time += step;
    this.volume = s.volume;
    for (const c of this.cells) c.u = (((c.u + c.drift * step) % 1) + 1) % 1;
  }

  private band(): number {
    return this.bounds.height * SURFACE_BAND;
  }

  private scaleAll(): number {
    return Math.max(0.5, Math.min(1.4, this.bounds.width / 1280));
  }

  /** セルの見かけの半幅 (px)。奥ほど小さい */
  cellWidth(c: SurfaceCell): number {
    return c.r * this.scaleAll() * (1.25 - 0.85 * c.v);
  }

  private cellCentreY(c: SurfaceCell): number {
    return this.band() * (0.06 + 0.86 * c.v);
  }

  private strength(l: Lighting): number {
    return Math.min(1, l.rayIntensity * (0.85 + 0.3 * clamp01(this.volume)));
  }

  /** セルの輪郭 (ゆらぐ楕円) を経路として描く */
  private cellPath(ctx: CanvasRenderingContext2D, c: SurfaceCell): void {
    const width = this.bounds.width;
    const rx = this.cellWidth(c);
    const ry = rx * (0.16 + 0.14 * (1 - c.v)); // 奥ほど平たく見える
    const cx = c.u * width;
    const cy = this.cellCentreY(c);
    const t = this.time * c.speed + c.phase;
    ctx.beginPath();
    for (let n = 0; n <= CELL_POINTS; n++) {
      const a = (n / CELL_POINTS) * Math.PI * 2;
      const wob = 1 + 0.2 * Math.sin(a * 3 + t) + 0.1 * Math.sin(a * 5 - t * 1.4 + c.phase);
      const x = cx + Math.cos(a) * rx * wob;
      const y = cy + Math.sin(a) * ry * wob;
      if (n === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  draw(ctx: CanvasRenderingContext2D, l: Lighting): void {
    const { width } = this.bounds;
    const band = this.band();
    const k = this.strength(l);
    const light = mixRGB(l.ray, [255, 255, 255], 0.5);
    const white = mixRGB(light, [255, 255, 255], 0.6);
    const trough = mixRGB(l.waterTop, [0, 0, 0], 0.65);
    ctx.save();

    // 1. 水面の帯: 上ほど明るい
    const g = ctx.createLinearGradient(0, 0, 0, band * 1.2);
    g.addColorStop(0, rgba(light, 0.3 * k + 0.05));
    g.addColorStop(0.6, rgba(light, 0.1 * k + 0.02));
    g.addColorStop(1, rgba(light, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, band * 1.2);

    // 2. 波の谷の陰影 (うっすら暗く)
    for (let i = 0; i < this.cells.length; i += 3) {
      const c = this.cells[i];
      const rx = this.cellWidth(c) * 0.7;
      const ry = rx * (0.14 + 0.1 * (1 - c.v));
      const breathe = 0.5 + 0.5 * Math.sin(this.time * c.speed * 0.8 + c.phase);
      ctx.fillStyle = rgba(trough, (0.05 + 0.07 * breathe) * (1 - 0.5 * c.v));
      ctx.beginPath();
      ctx.ellipse(c.u * width, this.cellCentreY(c), rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalCompositeOperation = "lighter";

    // 3. 太陽の光の窓: 太陽の方向だけ明るく抜ける。ゆっくり揺れ動く
    // 横長の楕円にして、帯の中で完全に消えるようにする (縦を SUN_SQUASH 倍に縮めて描く)
    const SUN_SQUASH = 0.35;
    const sunX = width * (0.5 + 0.22 * Math.sin(this.time * 0.05 + this.sunPhase));
    const sunR = band * 3.2;
    const sunY = -band * 0.4;
    ctx.save();
    ctx.scale(1, SUN_SQUASH);
    const sun = ctx.createRadialGradient(sunX, sunY / SUN_SQUASH, 0, sunX, sunY / SUN_SQUASH, sunR);
    sun.addColorStop(0, rgba(white, 0.45 * k));
    sun.addColorStop(0.35, rgba(light, 0.18 * k));
    sun.addColorStop(1, rgba(light, 0));
    ctx.fillStyle = sun;
    ctx.fillRect(sunX - sunR, 0, sunR * 2, (band * 1.2) / SUN_SQUASH);
    ctx.restore();

    // 4. 波の網目: にじみ (太く薄い) → 芯 (細く明るい)。太陽の近くほど明るい
    ctx.lineJoin = "round";
    for (const c of this.cells) {
      const near = 1 - 0.55 * c.v;
      const dx = (c.u * width - sunX) / Math.max(1, width);
      const sunBoost = 1 + 0.8 * Math.exp(-(dx * dx) / 0.02);
      this.cellPath(ctx, c);
      ctx.lineWidth = (1 + 2.4 * near) * 3;
      ctx.strokeStyle = rgba(light, 0.04 * near * k * sunBoost);
      ctx.stroke();
      ctx.lineWidth = 0.7 + 1.6 * near;
      ctx.strokeStyle = rgba(white, 0.16 * near * k * sunBoost);
      ctx.stroke();
    }

    // 5. 波の照り返しの線: 奥ほど間隔が詰まり、振れ幅が小さい
    ctx.lineCap = "round";
    const step = Math.max(6, width / 160);
    for (let i = 0; i < this.sheens.length; i++) {
      const s = this.sheens[i];
      const v = (i + 0.5) / this.sheens.length;
      const y0 = band * (0.05 + 0.9 * Math.pow(v, 1.4));
      const amp = band * 0.08 * (1 - 0.6 * v);
      ctx.beginPath();
      for (let x = 0; x <= width; x += step) {
        const u = x / Math.max(1, width);
        const y =
          y0 +
          Math.sin(u * s.freq * 2 + this.time * s.speed * 3 + s.phase) * amp +
          Math.sin(u * s.freq2 * 2 - this.time * s.speed * 2) * amp * 0.4;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.lineWidth = 1 + 2.5 * (1 - v);
      ctx.strokeStyle = rgba(light, 0.12 * (1 - 0.6 * v) * k);
      ctx.stroke();
    }

    // 6. 帯の下端: 水面の境目がかすかに揺らぐ
    ctx.beginPath();
    for (let x = 0; x <= width; x += step) {
      const u = x / Math.max(1, width);
      const y = band * (1 + 0.04 * Math.sin(u * 23 + this.time * 0.9) + 0.02 * Math.sin(u * 61 - this.time * 1.7));
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = rgba(light, 0.08 * k);
    ctx.stroke();

    // 7. きらめき: 波の山で日光が反射して、一瞬だけ光る。太陽の近くほど多い
    for (let i = 0; i < GLINTS; i++) {
      const u0 = hash(i * 1.37);
      const w2 = hash(i * 7.91 + 3);
      const tw = Math.sin(this.time * (1.3 + w2 * 1.7) + i * 2.1);
      const flash = Math.pow(Math.max(0, tw), 12);
      if (flash < 0.05) continue;
      // 太陽の位置の周りに寄せる
      const x = ((sunX / width + (u0 - 0.5) * 0.9 * (0.4 + w2)) % 1 + 1) % 1 * width;
      const y = band * (0.05 + 0.8 * w2 * w2);
      ctx.fillStyle = rgba(white, 0.75 * flash * k);
      ctx.beginPath();
      ctx.arc(x, y, 0.8 + 2 * flash * (1 - 0.5 * w2), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
