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

describe("LightRays soft cross-section", () => {
  type Call = { name: string; args: unknown[] };
  const stopsPerGradient = (calls: Call[]) => {
    // createLinearGradient の直後に続く addColorStop をひとまとめにする
    const groups: number[][] = [];
    for (const c of calls) {
      if (c.name === "createLinearGradient") groups.push([]);
      else if (c.name === "addColorStop" && groups.length > 0) {
        const s = String(c.args[1]);
        groups[groups.length - 1].push(Number(s.slice(s.lastIndexOf(",") + 1, -1)));
      }
    }
    return groups.filter((g) => g.length > 0);
  };

  it("each band fades out to both sides: transparent edges, brightest in the middle", () => {
    const r = new LightRays(B, mulberry32(8));
    const { ctx, calls } = stubCtx();
    r.draw(ctx, DAY);
    const groups = stopsPerGradient(calls);
    expect(groups.length).toBeGreaterThan(r.rays.length * 8); // 縦に細かく分けて描く
    for (const g of groups) {
      expect(g[0]).toBe(0);
      expect(g[g.length - 1]).toBe(0);
      const peak = Math.max(...g);
      expect(g[Math.floor(g.length / 2)]).toBe(peak);
      // 中心から端へなだらかに下がる (急な段差がない)
      for (let i = 1; i < g.length; i++) expect(Math.abs(g[i] - g[i - 1])).toBeLessThanOrEqual(peak * 0.5 + 0.001); // 小数 3 桁への丸め分
    }
  });

  it("brightness changes gradually down the ray (no visible steps between slices)", () => {
    const r = new LightRays(B, mulberry32(9));
    const { ctx, calls } = stubCtx();
    r.draw(ctx, DAY);
    const peaks = stopsPerGradient(calls).map((g) => Math.max(...g));
    // 筋ごとに分ける (上から下へ暗くなっていくので、明るさが増えたら次の筋)
    const rays: number[][] = [];
    for (const p of peaks) {
      const cur = rays[rays.length - 1];
      if (!cur || p > cur[cur.length - 1] + 1e-9) rays.push([p]);
      else cur.push(p);
    }
    expect(rays.length).toBeGreaterThan(3);
    for (const ray of rays) {
      const top = ray[0];
      // 隣り合う区切りの明るさの差は、その筋の一番明るい所の 15% 未満
      for (let i = 1; i < ray.length; i++) expect(ray[i - 1] - ray[i]).toBeLessThan(top * 0.15);
    }
  });
});

describe("LightRays seams", () => {
  it("slices meet exactly on whole pixels without overlapping (no bright lines at the joins)", () => {
    const r = new LightRays(B, mulberry32(10));
    const { ctx, calls } = stubCtx();
    r.draw(ctx, DAY);
    const ys = calls.filter((c) => c.name === "moveTo" || c.name === "lineTo").map((c) => (c.args as number[])[1]);
    for (const y of ys) expect(Number.isInteger(y)).toBe(true);
    // 各区切りの上端 (moveTo) は、前の区切りの下端と同じ高さか、次の筋の始まり (0)
    const quads: number[][] = [];
    calls.forEach((c, i) => {
      if (c.name === "moveTo") quads.push([(c.args as number[])[1], (calls[i + 2].args as number[])[1]]);
    });
    for (let i = 1; i < quads.length; i++) {
      const top = quads[i][0];
      if (top !== 0) expect(top).toBe(quads[i - 1][1]);
    }
  });
});
