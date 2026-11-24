import { describe, expect, it } from "vitest";
import { mulberry32 } from "../random";
import { DAY, NIGHT } from "../palette";
import { stubCtx } from "../test/stubCtx";
import { Caustics } from "./caustics";

const B = { width: 1200, height: 800 };
const silent = { low: 0, high: 0, volume: 0, beat: false, speed: 1 };
type Call = { name: string; args: unknown[] };

const alphas = (calls: Call[]) =>
  calls
    .filter((c) => c.name === "set:strokeStyle" || c.name === "set:fillStyle")
    .map((c) => String(c.args[0]))
    .filter((v) => v.startsWith("rgba"))
    .map((v) => Number(v.slice(v.lastIndexOf(",") + 1, -1)));
const points = (calls: Call[]) =>
  calls.filter((c) => c.name === "lineTo" || c.name === "moveTo").map((c) => c.args as number[]);

describe("Caustics", () => {
  for (const part of ["drawSurface", "drawFloor"] as const) {
    it(`${part}: balanced save/restore, finite numbers, alpha within 0..1`, () => {
      const c = new Caustics(B, mulberry32(1));
      c.update(1.3, { ...silent, volume: 1 });
      const { ctx, calls } = stubCtx();
      c[part](ctx, DAY);
      expect(calls.filter((x) => x.name === "save").length).toBe(calls.filter((x) => x.name === "restore").length);
      for (const x of calls) for (const a of x.args) if (typeof a === "number") expect(Number.isFinite(a)).toBe(true);
      const as = alphas(calls);
      expect(as.length).toBeGreaterThan(0);
      for (const a of as) expect(a >= 0 && a <= 1).toBe(true);
    });
  }

  it("floor light stays in the bottom band of the screen", () => {
    const c = new Caustics(B, mulberry32(2));
    const { ctx, calls } = stubCtx();
    c.drawFloor(ctx, DAY);
    const ys = points(calls).map((p) => p[1]);
    expect(ys.length).toBeGreaterThan(0);
    expect(Math.min(...ys)).toBeGreaterThan(B.height * 0.7);
    expect(Math.max(...ys)).toBeLessThanOrEqual(B.height);
  });

  it("is brighter by day than at night", () => {
    const c = new Caustics(B, mulberry32(3));
    const day = stubCtx();
    c.drawFloor(day.ctx, DAY);
    const night = stubCtx();
    c.drawFloor(night.ctx, NIGHT);
    expect(Math.max(...alphas(day.calls))).toBeGreaterThan(Math.max(...alphas(night.calls)));
  });

  it("far rings (near the top of the band) are fainter than near rings", () => {
    const c = new Caustics(B, mulberry32(4));
    const { ctx, calls } = stubCtx();
    c.drawFloor(ctx, DAY);
    // 各輪: strokeStyle の直前に描いた点の平均 y と alpha を対にする
    const rings: Array<{ y: number; a: number }> = [];
    let ys: number[] = [];
    for (const x of calls) {
      if (x.name === "moveTo" || x.name === "lineTo") ys.push((x.args as number[])[1]);
      if (x.name === "set:strokeStyle" && ys.length > 0) {
        const s = String(x.args[0]);
        rings.push({ y: ys.reduce((p, q) => p + q, 0) / ys.length, a: Number(s.slice(s.lastIndexOf(",") + 1, -1)) });
        ys = [];
      }
    }
    rings.sort((p, q) => p.y - q.y);
    const third = Math.max(1, Math.floor(rings.length / 3));
    const mean = (r: typeof rings) => r.reduce((p, q) => p + q.a, 0) / r.length;
    expect(mean(rings.slice(0, third))).toBeLessThan(mean(rings.slice(-third)));
  });

  it("the pattern moves over time", () => {
    const c = new Caustics(B, mulberry32(5));
    const a = stubCtx();
    c.drawFloor(a.ctx, DAY);
    c.update(0.5, silent);
    const b = stubCtx();
    c.drawFloor(b.ctx, DAY);
    expect(points(b.calls)).not.toEqual(points(a.calls));
  });
});

describe("Caustics realism", () => {
  it("the surface twinkles with small glints by day", () => {
    const c = new Caustics(B, mulberry32(61));
    let most = 0;
    for (let f = 0; f < 60; f++) {
      c.update(1 / 30, silent);
      const { ctx, calls } = stubCtx();
      c.drawSurface(ctx, DAY);
      most = Math.max(most, calls.filter((x) => x.name === "arc").length);
    }
    expect(most).toBeGreaterThan(3);
  });
  it("floor light has a soft glow around each bright line (two strokes per ring)", () => {
    const c = new Caustics(B, mulberry32(62));
    const { ctx, calls } = stubCtx();
    c.drawFloor(ctx, DAY);
    const strokes = calls.filter((x) => x.name === "stroke").length;
    const paths = calls.filter((x) => x.name === "beginPath").length;
    expect(strokes).toBeGreaterThanOrEqual(paths * 2 - 1);
  });
});
