import type { Lighting } from "../palette";

export interface Bounds {
  width: number;
  height: number;
}

/** 音声から得た刺激。値は呼び出し側で平滑化済み。speed は Lighting.speed */
export interface Stimulus {
  low: number;
  high: number;
  volume: number;
  beat: boolean;
  speed: number;
}

export interface SceneElement {
  resize(b: Bounds): void;
  update(dt: number, s: Stimulus): void;
  draw(ctx: CanvasRenderingContext2D, l: Lighting): void;
}
