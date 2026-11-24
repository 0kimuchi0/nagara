import type { Lighting } from "../palette";
import { mulberry32 } from "../random";
import type { Bounds, SceneElement, Stimulus } from "./types";

/** ノイズ画像 1 枚の大きさ (px) と、画面に並べるときの拡大率 */
const TILE = 128;
const SCALE = 2;
/** 粒の濃さ。昼は控えめ、暗い夜は少しだけ強く (暗部の粒状感) */
const ALPHA_DAY = 0.05;
const ALPHA_NIGHT = 0.08;

/** 灰色のノイズ (RGBA)。2 つの乱数の平均で、中間の灰色に集まる柔らかい粒にする */
export function noiseTile(size: number, seed: number): Uint8ClampedArray {
  const rand = mulberry32(seed);
  const out = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const v = Math.round(((rand() + rand()) / 2) * 255);
    out[i * 4] = v;
    out[i * 4 + 1] = v;
    out[i * 4 + 2] = v;
    out[i * 4 + 3] = 255;
  }
  return out;
}

export type MakeNoise = () => { image: CanvasImageSource; size: number } | null;

const browserNoise: MakeNoise = () => {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = TILE;
  c.height = TILE;
  const g = c.getContext("2d");
  if (!g) return null;
  const img = g.createImageData(TILE, TILE);
  img.data.set(noiseTile(TILE, 1234));
  g.putImageData(img, 0, 0);
  return { image: c, size: TILE };
};

/**
 * 写真のような粒状感: ごく薄いノイズを画面全体に重ねる。
 * 毎フレーム位置をずらして、粒がちらちらと動くようにする (静止した模様に見えないように)。
 */
export class Grain implements SceneElement {
  private bounds: Bounds;
  private rng: () => number;
  private make: MakeNoise;
  private noise: ReturnType<MakeNoise> | undefined;
  private ox = 0;
  private oy = 0;

  constructor(b: Bounds, rng: () => number, make: MakeNoise = browserNoise) {
    this.bounds = { ...b };
    this.rng = rng;
    this.make = make;
  }

  resize(b: Bounds): void {
    this.bounds = { ...b };
  }

  update(_dt: number, _s: Stimulus): void {
    this.ox = this.rng();
    this.oy = this.rng();
  }

  draw(ctx: CanvasRenderingContext2D, l: Lighting): void {
    if (this.noise === undefined) this.noise = this.make();
    if (!this.noise) return;
    const tile = this.noise.size * SCALE;
    const { width, height } = this.bounds;
    const dark = 1 - Math.min(1, l.rayIntensity / 0.8);
    ctx.save();
    ctx.globalCompositeOperation = "overlay";
    ctx.globalAlpha = ALPHA_DAY + (ALPHA_NIGHT - ALPHA_DAY) * dark;
    const sx = -Math.floor(this.ox * tile);
    const sy = -Math.floor(this.oy * tile);
    for (let y = sy; y < height; y += tile) {
      for (let x = sx; x < width; x += tile) ctx.drawImage(this.noise.image, x, y, tile, tile);
    }
    ctx.restore();
  }
}
