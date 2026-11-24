import { describe, expect, it } from "vitest";
import { mulberry32 } from "../random";
import { DAY } from "../palette";
import { stubCtx } from "../test/stubCtx";
import { drawBlurred, supportsFilter } from "./compose";
import { Grain, noiseTile } from "./grain";
import { Plants } from "./plants";
import { Floor } from "./floor";
import { Jellyfish } from "./jellyfish";

const B = { width: 1200, height: 800 };
type Call = { name: string; args: unknown[] };

describe("drawBlurred (depth of field)", () => {
  it("draws the far layer through a blur filter and resets the filter afterwards", () => {
    const { ctx, calls } = stubCtx();
    (ctx as unknown as { filter: string }).filter = "none";
    drawBlurred(ctx, {} as CanvasImageSource, 2.5, 1200, 800);
    const sets = calls.filter((c) => c.name === "set:filter").map((c) => c.args[0]);
    expect(sets).toContain("blur(2.5px)");
    expect(sets[sets.length - 1]).toBe("none");
    expect(calls.filter((c) => c.name === "drawImage")).toHaveLength(1);
  });
  it("falls back to a plain draw where canvas filters are not supported", () => {
    const { ctx, calls } = stubCtx();
    expect(supportsFilter(ctx)).toBe(false);
    drawBlurred(ctx, {} as CanvasImageSource, 2.5, 1200, 800);
    expect(calls.filter((c) => c.name === "set:filter")).toHaveLength(0);
    expect(calls.filter((c) => c.name === "drawImage")).toHaveLength(1);
  });
});

/** 描いた色すべての明るさの合計 (一部が明るくなれば増える) */
const brightest = (calls: Call[]) => {
  let best = 0;
  const take = (s: string) => {
    const m = s.match(/rgba?\((\d+),(\d+),(\d+)/);
    if (m) best += Number(m[1]) + Number(m[2]) + Number(m[3]);
  };
  for (const c of calls) {
    if (c.name === "set:fillStyle" || c.name === "set:strokeStyle") take(String(c.args[0]));
    if (c.name === "addColorStop") take(String(c.args[1]));
  }
  return best;
};

describe("Light falling on objects", () => {
  it("plants inside a light ray are lit brighter", () => {
    const p = new Plants(B, mulberry32(1));
    p.setLight(() => 0);
    const dark = stubCtx();
    p.draw(dark.ctx, DAY);
    p.setLight(() => 1);
    const lit = stubCtx();
    p.draw(lit.ctx, DAY);
    expect(brightest(lit.calls)).toBeGreaterThan(brightest(dark.calls));
  });
  it("stones inside a light ray are lit brighter", () => {
    const f = new Floor(B, mulberry32(2));
    f.setLight(() => 0);
    const dark = stubCtx();
    f.draw(dark.ctx, DAY);
    f.setLight(() => 1);
    const lit = stubCtx();
    f.draw(lit.ctx, DAY);
    expect(brightest(lit.calls)).toBeGreaterThan(brightest(dark.calls));
  });
  it("jellyfish inside a light ray glow brighter", () => {
    const j = new Jellyfish(B, mulberry32(3));
    j.setLight(() => 0);
    const dark = stubCtx();
    j.draw(dark.ctx, DAY);
    j.setLight(() => 1);
    const lit = stubCtx();
    j.draw(lit.ctx, DAY);
    expect(brightest(lit.calls)).toBeGreaterThan(brightest(dark.calls));
  });
});

describe("Film grain", () => {
  it("noise tile is mid-grey on average with a spread of values", () => {
    const t = noiseTile(64, 7);
    let sum = 0;
    let min = 255;
    let max = 0;
    for (let i = 0; i < 64 * 64; i++) {
      const v = t[i * 4];
      expect(t[i * 4 + 1]).toBe(v);
      expect(t[i * 4 + 2]).toBe(v);
      expect(t[i * 4 + 3]).toBe(255);
      sum += v;
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    expect(sum / (64 * 64)).toBeGreaterThan(110);
    expect(sum / (64 * 64)).toBeLessThan(145);
    expect(max - min).toBeGreaterThan(80);
  });
  it("draws faintly with a soft blend, moves every frame, and restores state", () => {
    const g = new Grain(B, mulberry32(4), () => ({ image: {} as CanvasImageSource, size: 128 }));
    const offsets: unknown[] = [];
    for (let f = 0; f < 3; f++) {
      g.update(1 / 60, { low: 0, high: 0, volume: 0, beat: false, speed: 1 });
      const { ctx, calls } = stubCtx();
      g.draw(ctx, DAY);
      const alpha = calls.find((c) => c.name === "set:globalAlpha")?.args[0] as number;
      expect(alpha).toBeGreaterThan(0);
      expect(alpha).toBeLessThan(0.12);
      expect(calls.some((c) => c.name === "set:globalCompositeOperation" && c.args[0] === "overlay")).toBe(true);
      expect(calls.filter((c) => c.name === "save").length).toBe(calls.filter((c) => c.name === "restore").length);
      offsets.push(calls.find((c) => c.name === "drawImage")?.args.slice(1, 3));
    }
    expect(new Set(offsets.map((o) => JSON.stringify(o))).size).toBeGreaterThan(1);
  });
  it("skips quietly when no noise image can be made", () => {
    const g = new Grain(B, mulberry32(5), () => null);
    const { ctx, calls } = stubCtx();
    expect(() => g.draw(ctx, DAY)).not.toThrow();
    expect(calls.filter((c) => c.name === "drawImage")).toHaveLength(0);
  });
});
