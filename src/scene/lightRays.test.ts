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

import { DAY, NIGHT } from "../palette";
import { stubCtx } from "../test/stubCtx";

describe("LightRays realism", () => {
  it("light is strongest along a ray's centre and fades between rays", () => {
    const r = new LightRays(B, mulberry32(3));
    const y = B.height * 0.2;
    const centre = r.rayCentreAt(0, y);
    const xs = r.rays.map((_, i) => r.rayCentreAt(i, y)).sort((a, b) => a - b);
    // 隣り合う筋の中間点
    let gap = -1;
    for (let i = 1; i < xs.length; i++) if (xs[i] - xs[i - 1] > 40) gap = (xs[i] + xs[i - 1]) / 2;
    expect(gap).toBeGreaterThan(0);
    expect(r.coverage(centre, y)).toBeGreaterThan(r.coverage(gap, y) + 0.05);
  });

  it("fades with depth (water absorbs light)", () => {
    const r = new LightRays(B, mulberry32(4));
    const top = r.coverage(r.rayCentreAt(0, B.height * 0.1), B.height * 0.1);
    const deep = r.coverage(r.rayCentreAt(0, B.height * 0.85), B.height * 0.85);
    expect(top).toBeGreaterThan(deep * 1.8);
  });

  it("rays fan out: they lean more toward the edges than in the middle", () => {
    const r = new LightRays(B, mulberry32(5));
    const lean = r.rays.map((_, i) => r.rayCentreAt(i, B.height) - r.rayCentreAt(i, 0));
    const order = r.rays.map((ray, i) => ({ nx: ray.nx, lean: lean[i] })).sort((a, b) => a.nx - b.nx);
    expect(order[order.length - 1].lean).toBeGreaterThan(order[0].lean);
  });

  it("shimmers over time", () => {
    const r = new LightRays(B, mulberry32(6));
    const x = r.rayCentreAt(0, 100);
    const a = r.coverage(x, 100);
    for (let i = 0; i < 120; i++) r.update(1 / 60, silent);
    expect(r.coverage(r.rayCentreAt(0, 100), 100)).not.toBeCloseTo(a, 3);
  });

  it("draws additively, restores state, alpha within 0..1, brighter by day", () => {
    const r = new LightRays(B, mulberry32(7));
    const alphaMax = (l: typeof DAY) => {
      const { ctx, calls } = stubCtx();
      r.draw(ctx, l);
      expect(calls.filter((c) => c.name === "save").length).toBe(calls.filter((c) => c.name === "restore").length);
      expect(calls.some((c) => c.name === "set:globalCompositeOperation" && c.args[0] === "lighter")).toBe(true);
      const as = calls
        .filter((c) => c.name === "addColorStop")
        .map((c) => String(c.args[1]))
        .map((s) => Number(s.slice(s.lastIndexOf(",") + 1, -1)));
      for (const a of as) expect(a >= 0 && a <= 1).toBe(true);
      return Math.max(...as);
    };
    expect(alphaMax(DAY)).toBeGreaterThan(alphaMax(NIGHT));
  });
});
