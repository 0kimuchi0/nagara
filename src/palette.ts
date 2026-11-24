export type RGB = [number, number, number];

export interface Lighting {
  waterTop: RGB;
  waterBottom: RGB;
  ray: RGB;
  rayIntensity: number;
  plant: RGB;
  jellyGlow: number;
  speed: number;
}

/** 朝：淡い緑と水色 */
export const MORNING: Lighting = {
  waterTop: [150, 210, 205],
  waterBottom: [70, 140, 150],
  ray: [220, 245, 230],
  rayIntensity: 0.45,
  plant: [110, 190, 140],
  jellyGlow: 0.2,
  speed: 0.85,
};

/** 昼：澄んだ青緑、光線が最も強い */
export const DAY: Lighting = {
  waterTop: [70, 190, 210],
  waterBottom: [10, 90, 130],
  ray: [235, 250, 255],
  rayIntensity: 0.8,
  plant: [60, 170, 110],
  jellyGlow: 0.1,
  speed: 1,
};

/** 夕：橙がかった暖色 */
export const EVENING: Lighting = {
  waterTop: [215, 150, 100],
  waterBottom: [100, 70, 110],
  ray: [255, 205, 140],
  rayIntensity: 0.55,
  plant: [150, 140, 90],
  jellyGlow: 0.4,
  speed: 0.75,
};

/** 夜：暗い紺と青、クラゲの発光が最大 */
export const NIGHT: Lighting = {
  waterTop: [20, 40, 90],
  waterBottom: [5, 10, 30],
  ray: [90, 120, 190],
  rayIntensity: 0.12,
  plant: [25, 60, 80],
  jellyGlow: 1,
  speed: 0.5,
};

/** 各境界時刻を中心に ±30 分で線形ブレンドする。 */
const BLEND_HALF = 0.5;
const BOUNDARIES: { hour: number; from: Lighting; to: Lighting }[] = [
  { hour: 5, from: NIGHT, to: MORNING },
  { hour: 10, from: MORNING, to: DAY },
  { hour: 16, from: DAY, to: EVENING },
  { hour: 19, from: EVENING, to: NIGHT },
];

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const lerpRgb = (a: RGB, b: RGB, t: number): RGB => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerp(a[2], b[2], t),
];

function mix(a: Lighting, b: Lighting, t: number): Lighting {
  return {
    waterTop: lerpRgb(a.waterTop, b.waterTop, t),
    waterBottom: lerpRgb(a.waterBottom, b.waterBottom, t),
    ray: lerpRgb(a.ray, b.ray, t),
    rayIntensity: lerp(a.rayIntensity, b.rayIntensity, t),
    plant: lerpRgb(a.plant, b.plant, t),
    jellyGlow: lerp(a.jellyGlow, b.jellyGlow, t),
    speed: lerp(a.speed, b.speed, t),
  };
}

/** hour（0〜24 の小数）に対応する照明。純粋な時間帯では定数そのものを返す。 */
export function lightingAt(hour: number): Lighting {
  const h = ((hour % 24) + 24) % 24;
  for (const b of BOUNDARIES) {
    if (Math.abs(h - b.hour) < BLEND_HALF) {
      return mix(b.from, b.to, (h - (b.hour - BLEND_HALF)) / (2 * BLEND_HALF));
    }
  }
  if (h >= 5 && h < 10) return MORNING;
  if (h >= 10 && h < 16) return DAY;
  if (h >= 16 && h < 19) return EVENING;
  return NIGHT;
}

/** `?hour=N`（0 ≤ N < 24、小数可）を解釈する。不正なら null。 */
export function parseHourOverride(search: string): number | null {
  const raw = new URLSearchParams(search).get('hour');
  if (raw === null || raw.trim() === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n >= 24) return null;
  return n;
}

export function currentHour(now: Date, override: number | null): number {
  if (override !== null) return override;
  return now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
}
