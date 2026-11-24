import { describe, expect, it } from "vitest";
import { mulberry32 } from "../random";
import { LightRays } from "./lightRays";
import type { Stimulus } from "./types";

const B = { width: 1200, height: 800 };
const silent: Stimulus = { low: 0, high: 0, volume: 0, beat: false, speed: 1 };

function peakAfterBeat(dt: number): number {
  const r = new LightRays(B, mulberry32(1));
  r.update(dt, { ...silent, beat: true });
  let peak = r.beatWobble;
  for (let t = dt; t < 2; t += dt) {
    r.update(dt, silent);
    peak = Math.max(peak, r.beatWobble);
  }
  return peak;
}

describe("LightRays", () => {
  it("beat wobble peak is nearly independent of refresh rate", () => {
    const a = peakAfterBeat(1 / 60);
    const b = peakAfterBeat(1 / 144);
    expect(a).toBeGreaterThan(0.5);
    expect(Math.abs(a - b) / a).toBeLessThan(0.15);
  });

  it("keeps ray layout stable across resize (normalized positions)", () => {
    const r = new LightRays(B, mulberry32(2));
    const before = r.xs.map((x) => x / B.width);
    r.resize({ width: 1920, height: 1080 });
    r.xs.forEach((x, i) => expect(x / 1920).toBeCloseTo(before[i], 6));
  });
});
