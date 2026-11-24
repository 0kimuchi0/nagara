import { describe, expect, it } from "vitest";
import { mulberry32 } from "../random";
import { DAY, NIGHT } from "../palette";
import { stubCtx } from "../test/stubCtx";
import { WaterVolume } from "./waterVolume";
import { BubbleStream, MAX_STREAM_BUBBLES } from "./bubbleStream";
import { drawBubble } from "./bubbleDraw";

const B = { width: 1200, height: 800 };
const silent = { low: 0, high: 0, volume: 0, beat: false, speed: 1 };
type Call = { name: string; args: unknown[] };
const alphaOf = (s: string) => Number(s.slice(s.lastIndexOf(",") + 1, -1));
const alphas = (calls: Call[]) => [
  ...calls
    .filter((c) => c.name === "set:strokeStyle" || c.name === "set:fillStyle")
    .map((c) => String(c.args[0]))
    .filter((v) => v.startsWith("rgba"))
    .map(alphaOf),
  ...calls.filter((c) => c.name === "addColorStop").map((c) => String(c.args[1])).filter((v) => v.startsWith("rgba")).map(alphaOf),
];
const finiteAndBounded = (calls: Call[]) => {
  for (const c of calls) for (const a of c.args) if (typeof a === "number") expect(Number.isFinite(a)).toBe(true);
  for (const a of alphas(calls)) expect(a >= 0 && a <= 1).toBe(true);
  expect(calls.filter((c) => c.name === "save").length).toBe(calls.filter((c) => c.name === "restore").length);
};

describe("WaterVolume", () => {
  it("draws safely by day and night", () => {
    const w = new WaterVolume(B, mulberry32(1));
    w.update(3, silent);
    for (const l of [DAY, NIGHT]) {
      const { ctx, calls } = stubCtx();
      w.draw(ctx, l);
      finiteAndBounded(calls);
    }
  });

  it("slow turbidity clouds drift across the water and wrap around", () => {
    const w = new WaterVolume(B, mulberry32(2));
    const before = w.clouds.map((c) => c.x);
    for (let i = 0; i < 600; i++) w.update(1 / 60, silent);
    const after = w.clouds.map((c) => c.x);
    expect(after).not.toEqual(before);
    for (let i = 0; i < 60 * 600; i++) w.update(1 / 60, silent);
    for (const c of w.clouds) {
      expect(c.x).toBeGreaterThanOrEqual(-c.r);
      expect(c.x).toBeLessThanOrEqual(B.width + c.r);
    }
  });

  it("marine snow sinks slowly; nearer specks are larger and sink faster", () => {
    const w = new WaterVolume(B, mulberry32(3));
    const y0 = w.snow.map((s) => s.y);
    w.update(0.5, silent);
    const moved = w.snow.map((s, i) => ({ d: s.depth, r: s.r, dy: s.y - y0[i] }));
    const sinking = moved.filter((m) => m.dy > 0 && m.dy < 20);
    expect(sinking.length).toBeGreaterThan(moved.length * 0.8);
    const near = moved.filter((m) => m.d > 0.6 && m.dy > 0 && m.dy < 20);
    const far = moved.filter((m) => m.d < 0.4 && m.dy > 0 && m.dy < 20);
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(near.map((m) => m.r))).toBeGreaterThan(mean(far.map((m) => m.r)));
    expect(mean(near.map((m) => m.dy))).toBeGreaterThan(mean(far.map((m) => m.dy)));
  });

  it("marine snow wraps from the bottom back to the top", () => {
    const w = new WaterVolume(B, mulberry32(4));
    for (let i = 0; i < 60 * 300; i++) w.update(1 / 60, silent);
    for (const s of w.snow) {
      expect(s.y).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeLessThanOrEqual(B.height);
    }
  });

  it("distant kelp silhouettes rise from the far floor and sway", () => {
    const w = new WaterVolume(B, mulberry32(5));
    expect(w.kelp.length).toBeGreaterThanOrEqual(3);
    const tops = (calls: Call[]) => calls.filter((c) => c.name === "lineTo" || c.name === "ellipse").map((c) => c.args);
    const a = stubCtx();
    w.draw(a.ctx, DAY);
    for (let i = 0; i < 120; i++) w.update(1 / 60, silent);
    const b = stubCtx();
    w.draw(b.ctx, DAY);
    expect(tops(b.calls)).not.toEqual(tops(a.calls));
    for (const k of w.kelp) {
      expect(k.base).toBeGreaterThan(B.height * 0.8);
      expect(k.base - k.height).toBeGreaterThan(B.height * 0.2);
    }
  });

  it("has a bright scattering glow under the surface and darker, deeper water lower down", () => {
    const w = new WaterVolume(B, mulberry32(6));
    const { ctx, calls } = stubCtx();
    w.draw(ctx, DAY);
    const lin = calls.filter((c) => c.name === "createLinearGradient").map((c) => c.args as number[]);
    expect(lin.some(([, y0, , y1]) => y0 < B.height * 0.15 && y1 > y0)).toBe(true);
    expect(lin.some(([, y0, , y1]) => y0 > B.height * 0.4 && y1 > y0)).toBe(true);
  });
});

describe("BubbleStream (airstone)", () => {
  it("emits a steady chain of small bubbles from the ground that rise and stay close to the source", () => {
    const s = new BubbleStream(B, mulberry32(7));
    s.setGround(() => B.height * 0.92);
    for (let i = 0; i < 60 * 3; i++) s.update(1 / 60, silent);
    expect(s.items.length).toBeGreaterThan(10);
    expect(s.items.length).toBeLessThanOrEqual(MAX_STREAM_BUBBLES);
    for (const b of s.items) {
      const src = s.sources.reduce((best, x) => (Math.abs(x - b.x) < Math.abs(best - b.x) ? x : best), Infinity);
      expect(Math.abs(b.x - src)).toBeLessThan(25);
      expect(b.y).toBeLessThanOrEqual(B.height * 0.92 + 1);
    }
  });
  it("bubbles disappear when they reach the surface", () => {
    const s = new BubbleStream(B, mulberry32(8));
    s.setGround(() => B.height * 0.92);
    for (let i = 0; i < 60 * 30; i++) s.update(1 / 60, silent);
    for (const b of s.items) expect(b.y).toBeGreaterThan(B.height * 0.08);
    expect(s.items.length).toBeLessThanOrEqual(MAX_STREAM_BUBBLES);
  });
  it("draws safely", () => {
    const s = new BubbleStream(B, mulberry32(9));
    for (let i = 0; i < 120; i++) s.update(1 / 60, silent);
    const { ctx, calls } = stubCtx();
    s.draw(ctx, DAY);
    finiteAndBounded(calls);
  });
});

describe("drawBubble", () => {
  it("draws a faint body, a bright rim and a highlight, all with alpha in 0..1", () => {
    const { ctx, calls } = stubCtx();
    drawBubble(ctx, 100, 100, 6, [220, 240, 255], 0.3);
    expect(calls.filter((c) => c.name === "fill").length).toBeGreaterThanOrEqual(2);
    expect(calls.filter((c) => c.name === "stroke").length).toBeGreaterThanOrEqual(1);
    finiteAndBounded(calls);
  });
});
