import { describe, expect, it } from "vitest";
import { mulberry32 } from "../random";
import { DAY, NIGHT } from "../palette";
import { stubCtx } from "../test/stubCtx";
import { Plants } from "./plants";
import { Particles } from "./particles";
import { Floor } from "./floor";
import { Jellyfish } from "./jellyfish";
import type { Stimulus } from "./types";

const B = { width: 1200, height: 800 };
const silent: Stimulus = { low: 0, high: 0, volume: 0, beat: false, speed: 1 };
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const strokes = (calls: Array<{ name: string }>) => calls.filter((c) => c.name === "stroke").length;
const fills = (calls: Array<{ name: string }>) => calls.filter((c) => c.name === "fill").length;

describe("Plants depth", () => {
  it("has stalks in both layers, and far stalks are shorter and thinner", () => {
    const p = new Plants(B, mulberry32(21));
    const far = p.stalks.filter((s) => s.depth < 0.5);
    const near = p.stalks.filter((s) => s.depth >= 0.5);
    expect(far.length).toBeGreaterThan(3);
    expect(near.length).toBeGreaterThan(3);
    expect(mean(far.map((s) => s.height))).toBeLessThan(mean(near.map((s) => s.height)));
    expect(mean(far.map((s) => s.width))).toBeLessThan(mean(near.map((s) => s.width)));
  });
  it("drawLayer draws each stalk exactly once across the two layers", () => {
    const p = new Plants(B, mulberry32(22));
    const a = stubCtx();
    p.drawLayer(a.ctx, DAY, "far");
    const b = stubCtx();
    p.drawLayer(b.ctx, DAY, "near");
    const all = stubCtx();
    p.draw(all.ctx, DAY);
    expect(strokes(a.calls) + strokes(b.calls)).toBe(strokes(all.calls));
    expect(strokes(a.calls)).toBeGreaterThan(0);
    expect(strokes(b.calls)).toBeGreaterThan(0);
  });
});

describe("Particles depth", () => {
  it("near particles are larger and move faster than far ones", () => {
    const p = new Particles(B, mulberry32(23));
    const before = p.items.map((i) => ({ x: i.x, y: i.y }));
    p.update(0.1, silent);
    const moved = p.items.map((i, k) => ({ d: i.depth, r: i.r, m: Math.hypot(i.x - before[k].x, i.y - before[k].y) }));
    const far = moved.filter((m) => m.d < 0.5);
    const near = moved.filter((m) => m.d >= 0.5);
    expect(mean(near.map((m) => m.r))).toBeGreaterThan(mean(far.map((m) => m.r)) * 1.5);
    expect(mean(near.map((m) => m.m))).toBeGreaterThan(mean(far.map((m) => m.m)));
  });
  it("drawLayer splits particles between the layers", () => {
    const p = new Particles(B, mulberry32(24));
    const a = stubCtx();
    p.drawLayer(a.ctx, DAY, "far");
    const b = stubCtx();
    p.drawLayer(b.ctx, DAY, "near");
    expect(fills(a.calls) + fills(b.calls)).toBe(p.items.length);
  });
});

describe("Floor depth", () => {
  it("far stones sit higher on the floor than near stones", () => {
    const f = new Floor(B, mulberry32(25));
    const far = f.shapes.filter((s) => s.depth < 0.5);
    const near = f.shapes.filter((s) => s.depth >= 0.5);
    expect(far.length).toBeGreaterThan(0);
    expect(near.length).toBeGreaterThan(0);
    for (const s of near) expect(s.base).toBe(B.height);
    for (const s of far) expect(s.base).toBeLessThan(B.height);
  });
});

describe("Jellyfish depth", () => {
  it("each body has a depth; farther bodies are drawn smaller and first", () => {
    const j = new Jellyfish(B, mulberry32(26));
    const bodies = [...j.bodies];
    expect(bodies.every((b) => b.depth >= 0 && b.depth <= 1)).toBe(true);
    const byDepth = [...bodies].sort((a, b) => a.depth - b.depth);
    for (let i = 1; i < byDepth.length; i++) {
      if (byDepth[i].depth - byDepth[i - 1].depth > 0.15) {
        expect(byDepth[i].scale).toBeGreaterThan(byDepth[i - 1].scale);
      }
    }
    const { ctx, calls } = stubCtx();
    j.draw(ctx, NIGHT);
    const xs = calls.filter((c) => c.name === "translate").map((c) => c.args[0] as number).filter((_, i) => i % 2 === 0);
    expect(xs).toEqual(byDepth.map((b) => b.x));
  });
});
