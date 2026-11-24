import type { Lighting, RGB } from "../palette";
import { mixRGB } from "./depth";
import type { Bounds, SceneElement, Stimulus } from "./types";

/** 水底のうち光が揺れる帯の高さ (画面の高さに対する比率) */
const FLOOR_BAND = 0.22;

const rgba = (c: RGB, a: number): string =>
  `rgba(${c[0]},${c[1]},${c[2]},${Math.min(1, Math.max(0, a)).toFixed(3)})`;

/** 水底で揺れる光の輪の数 */
const CELLS = 70;
const CELL_POINTS = 24;

interface Cell {
  /** 0..1 横位置 */
  u: number;
  /** 0..1 帯の中の奥行き (0 = 奥, 1 = 手前) */
  v: number;
  /** 基準の半径 (px、手前のとき) */
  r: number;
  phase: number;
  speed: number;
  drift: number;
}

/**
 * 水の透明感を出す光の表現。
 * - 水底 (と石の上) で揺れる網目状の光 (コースティクス)
 * 水面は surface.ts の WaterSurface が描く。
 * 明るさは照明の rayIntensity と音量 (平滑化済み) で決まる。
 */
export class Caustics implements SceneElement {
  private bounds: Bounds;
  private time = 0;
  private volume = 0;
  private cells: Cell[] = [];

  constructor(b: Bounds, rng: () => number) {
    this.bounds = { ...b };
    for (let i = 0; i < CELLS; i++) {
      this.cells.push({
        u: rng(),
        v: Math.sqrt(rng()), // 手前を多めに
        r: 38 + rng() * 34,
        phase: rng() * Math.PI * 2,
        speed: 0.5 + rng() * 0.6,
        drift: (rng() - 0.5) * 0.02,
      });
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

  draw(ctx: CanvasRenderingContext2D, l: Lighting): void {
    this.drawFloor(ctx, l);
  }

  private strength(l: Lighting): number {
    const v = Math.min(1, Math.max(0, this.volume));
    return Math.min(1, l.rayIntensity * (0.85 + 0.3 * v));
  }

  /**
   * 水底: ゆらゆら形を変える光の輪をたくさん重ねる。重なった所が明るくなって網目に見える。
   * 奥 (帯の上側) ほど輪は小さく平たく薄く、帯の上端では見えなくなる。
   */
  drawFloor(ctx: CanvasRenderingContext2D, l: Lighting): void {
    const { width, height } = this.bounds;
    const top = height * (1 - FLOOR_BAND);
    const band = height - top;
    const k = this.strength(l);
    const light = mixRGB(l.ray, [255, 255, 255], 0.35);
    const scaleAll = Math.max(0.5, Math.min(1.4, width / 1280));
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineJoin = "round";
    for (const c of this.cells) {
      const v = c.v;
      const fade = v * v * (3 - 2 * v); // 奥の端は 0
      if (fade <= 0.01) continue;
      const cx = c.u * width;
      const cy = top + band * (0.08 + 0.92 * v);
      const rx = c.r * scaleAll * (0.35 + 0.65 * v);
      const ry = rx * (0.28 + 0.27 * v); // 遠近で平たく
      const t = this.time * c.speed + c.phase;
      ctx.beginPath();
      for (let n = 0; n <= CELL_POINTS; n++) {
        const a = (n / CELL_POINTS) * Math.PI * 2;
        const wob = 1 + 0.22 * Math.sin(a * 3 + t) + 0.12 * Math.sin(a * 5 - t * 1.3 + c.phase);
        const x = cx + Math.cos(a) * rx * wob;
        const y = Math.min(height, cy + Math.sin(a) * ry * wob);
        if (n === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      // にじみ (太く薄い) → 芯 (細く明るい) の 2 回描きで、光の線が柔らかく光って見える
      ctx.lineWidth = (1 + 2.2 * v) * 3.2;
      ctx.strokeStyle = rgba(light, 0.035 * fade * k);
      ctx.stroke();
      ctx.lineWidth = 0.8 + 1.6 * v;
      ctx.strokeStyle = rgba(mixRGB(light, [255, 255, 255], 0.3), 0.14 * fade * k);
      ctx.stroke();
    }
    ctx.restore();
  }
}
