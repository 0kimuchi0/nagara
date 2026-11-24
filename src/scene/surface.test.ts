import { describe, expect, it } from "vitest";
import { mulberry32 } from "../random";
import { DAY, NIGHT } from "../palette";
import { stubCtx } from "../test/stubCtx";
import { SURFACE_BAND, WaterSurface } from "./surface";

const B = { width: 1200, height: 800 };
const silent = { low: 0, high: 0, volume: 0, beat: false, speed: 1 };
type Call = { name: string; args: unknown[] };

const alphaOf = (s: string) => Number(s.slice(s.lastIndexOf(",") + 1, -1));
const allAlphas = (calls: Call[]) => [
  ...calls
    .filter((c) => c.name === "set:strokeStyle" || c.name === "set:fillStyle")
    .map((c) => String(c.args[0]))
    .filter((v) => v.startsWith("rgba"))
    .map(alphaOf),
  ...calls.filter((c) => c.name === "addColorStop").map((c) => alphaOf(String(c.args[1]))),
];

/** beginPath ごとに、その経路の点を集める */
function paths(calls: Call[]): number[][][] {
  const out: number[][][] = [];
  for (const c of calls) {
    if (c.name === "beginPath") out.push([]);
    else if ((c.name === "moveTo" || c.name === "lineTo") && out.length > 0) out[out.length - 1].push(c.args as number[]);
  }
  return out.filter((p) => p.length > 0);
}

function draw(s: WaterSurface, l = DAY) {
  const { ctx, calls } = stubCtx();
  s.draw(ctx, l);
  return calls;
}

describe("WaterSurface", () => {
  it("balanced save/restore, finite numbers, every alpha within 0..1", () => {
    const s = new WaterSurface(B, mulberry32(1));
    s.update(2.3, { ...silent, volume: 1 });
    const calls = draw(s);
    expect(calls.filter((c) => c.name === "save").length).toBe(calls.filter((c) => c.name === "restore").length);
    for (const c of calls) for (const a of c.args) if (typeof a === "number") expect(Number.isFinite(a)).toBe(true);
    const as = allAlphas(calls);
    expect(as.length).toBeGreaterThan(20);
    for (const a of as) expect(a >= 0 && a <= 1).toBe(true);
  });

  it("stays in the surface band at the top of the screen", () => {
    const s = new WaterSurface(B, mulberry32(2));
    const ys = paths(draw(s)).flat().map((p) => p[1]);
    expect(Math.max(...ys)).toBeLessThanOrEqual(B.height * SURFACE_BAND * 1.25);
  });

  it("wave cells look smaller toward the far edge of the surface (perspective)", () => {
    const s = new WaterSurface(B, mulberry32(3));
    const cells = s.cells.map((c) => ({ v: c.v, w: s.cellWidth(c) }));
    const near = cells.filter((c) => c.v < 0.33).map((c) => c.w);
    const far = cells.filter((c) => c.v > 0.66).map((c) => c.w);
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(near.length).toBeGreaterThan(3);
    expect(far.length).toBeGreaterThan(3);
    expect(mean(near)).toBeGreaterThan(mean(far) * 1.6);
  });

  it("has a brighter sun window (a radial glow) that drifts over time", () => {
    const s = new WaterSurface(B, mulberry32(4));
    const glow = (calls: Call[]) => calls.find((c) => c.name === "createRadialGradient")?.args as number[] | undefined;
    const a = glow(draw(s));
    expect(a).toBeDefined();
    for (let i = 0; i < 300; i++) s.update(1 / 60, silent);
    const b = glow(draw(s));
    expect(b![0]).not.toBeCloseTo(a![0], 1);
  });

  it("the wave pattern moves over time", () => {
    const s = new WaterSurface(B, mulberry32(5));
    const a = paths(draw(s));
    s.update(0.4, silent);
    expect(paths(draw(s))).not.toEqual(a);
  });

  it("is brighter by day than at night", () => {
    const s = new WaterSurface(B, mulberry32(6));
    const max = (l: typeof DAY) => Math.max(...allAlphas(draw(s, l)));
    expect(max(DAY)).toBeGreaterThan(max(NIGHT));
  });

  it("twinkles with small glints by day", () => {
    const s = new WaterSurface(B, mulberry32(7));
    let most = 0;
    for (let f = 0; f < 60; f++) {
      s.update(1 / 30, silent);
      most = Math.max(most, draw(s).filter((c) => c.name === "arc").length);
    }
    expect(most).toBeGreaterThan(3);
  });

  it("shades the wave troughs a little darker (relief), not only bright lines", () => {
    const s = new WaterSurface(B, mulberry32(8));
    const calls = draw(s);
    const dark = calls
      .filter((c) => c.name === "set:fillStyle")
      .map((c) => String(c.args[0]))
      .filter((v) => v.startsWith("rgba("))
      .filter((v) => {
        const [r, g, b] = v.slice(5, -1).split(",").map(Number);
        return r + g + b < 200;
      });
    expect(dark.length).toBeGreaterThan(3);
  });
});

describe("WaterSurface sun window edge", () => {
  it("the sun glow has fully faded before the bottom of the area it fills (no straight cut-off line)", () => {
    const s = new WaterSurface(B, mulberry32(9));
    const { ctx, calls } = stubCtx();
    s.draw(ctx, DAY);
    const i = calls.findIndex((c) => c.name === "createRadialGradient");
    const [, cy, , , , r] = calls[i].args as number[];
    const squash = (calls.slice(0, i).reverse().find((c) => c.name === "scale")?.args[1] as number) ?? 1;
    const rect = calls.slice(i).find((c) => c.name === "fillRect")!.args as number[];
    const rectBottom = rect[1] + rect[3];
    // 縮めた座標で、グラデーションの外周 (透明) が塗る範囲の下端より上にある
    expect(cy + r).toBeLessThanOrEqual(rectBottom);
    expect((cy + r) * squash).toBeLessThanOrEqual(B.height * SURFACE_BAND * 1.2);
  });
});
