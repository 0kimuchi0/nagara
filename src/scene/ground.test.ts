import { describe, expect, it } from "vitest";
import { mulberry32 } from "../random";
import { DAY, NIGHT } from "../palette";
import { stubCtx } from "../test/stubCtx";
import { Floor } from "./floor";
import { Plants } from "./plants";

const B = { width: 1400, height: 800 };
const silent = { low: 0, high: 0, volume: 0, beat: false, speed: 1 };
type Call = { name: string; args: unknown[] };

describe("Ground (substrate)", () => {
  it("has a gently rolling top edge in the lower part of the screen, not a flat line", () => {
    const f = new Floor(B, mulberry32(1));
    const ys = Array.from({ length: 50 }, (_, i) => f.terrainTop((i / 49) * B.width));
    for (const y of ys) {
      expect(y).toBeGreaterThan(B.height * 0.85);
      expect(y).toBeLessThan(B.height * 0.97);
    }
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(B.height * 0.015);
    // なめらか: 隣り合う点の差が小さい
    for (let i = 1; i < ys.length; i++) expect(Math.abs(ys[i] - ys[i - 1])).toBeLessThan(B.height * 0.01);
  });

  it("near stones sit on the substrate, slightly sunk in; far stones stay further back", () => {
    const f = new Floor(B, mulberry32(2));
    for (const s of f.shapes.filter((x) => x.depth >= 0.5)) {
      const top = f.terrainTop(s.x + s.w / 2);
      expect(s.base).toBeGreaterThan(top);
      expect(s.base).toBeLessThan(top + s.h * 0.5);
    }
    const nearMin = Math.min(...f.shapes.filter((x) => x.depth >= 0.5).map((s) => s.base));
    for (const s of f.shapes.filter((x) => x.depth < 0.5)) expect(s.base).toBeLessThan(nearMin);
  });

  it("draws a contact shadow under every near stone", () => {
    const f = new Floor(B, mulberry32(3));
    const { ctx, calls } = stubCtx();
    f.drawLayer(ctx, DAY, "near");
    const ellipses = calls.filter((c) => c.name === "ellipse").map((c) => c.args as number[]);
    for (const s of f.shapes.filter((x) => x.depth >= 0.5)) {
      const cx = s.x + s.w / 2;
      const hit = ellipses.some(([x, y, rx]) => Math.abs(x - cx) < s.w * 0.2 && Math.abs(y - s.base) < s.h * 0.4 && rx > s.w * 0.35);
      expect(hit).toBe(true);
    }
  });

  it("scatters many sand grains and pebbles, bigger toward the bottom", () => {
    const f = new Floor(B, mulberry32(4));
    const peb = f.pebbles;
    expect(peb.length).toBeGreaterThan(B.width / 10);
    const top = peb.filter((p) => p.v < 0.3).map((p) => p.r);
    const bottom = peb.filter((p) => p.v > 0.7).map((p) => p.r);
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(bottom)).toBeGreaterThan(mean(top) * 1.5);
    for (const p of peb) {
      expect(p.y).toBeGreaterThanOrEqual(f.terrainTop(p.x) - 1);
      expect(p.y).toBeLessThanOrEqual(B.height);
    }
  });

  it("grows small grass tufts on the substrate that sway", () => {
    const f = new Floor(B, mulberry32(5));
    expect(f.tufts.length).toBeGreaterThan(8);
    for (const t of f.tufts) expect(Math.abs(t.y - f.terrainTop(t.x))).toBeLessThan(4);
    const lines = (c: Call[]) => c.filter((x) => x.name === "quadraticCurveTo").map((x) => x.args);
    const a = stubCtx();
    f.drawLayer(a.ctx, DAY, "near");
    for (let i = 0; i < 60; i++) f.update(1 / 60, silent);
    const b = stubCtx();
    f.drawLayer(b.ctx, DAY, "near");
    expect(lines(b.calls)).not.toEqual(lines(a.calls));
  });

  it("draws with finite numbers and alpha within 0..1 by day and night", () => {
    const f = new Floor(B, mulberry32(6));
    for (const l of [DAY, NIGHT]) {
      const { ctx, calls } = stubCtx();
      f.draw(ctx, l);
      for (const c of calls) for (const a of c.args) if (typeof a === "number") expect(Number.isFinite(a)).toBe(true);
      const as = calls
        .filter((c) => c.name === "set:fillStyle" || c.name === "set:strokeStyle")
        .map((c) => String(c.args[0]))
        .filter((v) => v.startsWith("rgba"))
        .map((v) => Number(v.slice(v.lastIndexOf(",") + 1, -1)));
      for (const a of as) expect(a >= 0 && a <= 1).toBe(true);
    }
  });
});

describe("Plants planted in the substrate", () => {
  it("near plants are rooted at the substrate surface (slightly below it)", () => {
    const f = new Floor(B, mulberry32(7));
    const p = new Plants(B, mulberry32(8));
    p.setGround((x) => f.terrainTop(x));
    p.stalks.forEach((s, i) => {
      if (s.depth < 0.9) return;
      const root = p.rootY(i);
      const top = f.terrainTop(p.roots[i]);
      expect(root).toBeGreaterThanOrEqual(top);
      expect(root).toBeLessThan(top + 12);
    });
  });
});

describe("Far floor", () => {
  it("is a solid sandy floor behind the substrate (far stones do not float in open water)", () => {
    const f = new Floor(B, mulberry32(9));
    const { ctx, calls } = stubCtx();
    f.drawLayer(ctx, DAY, "far");
    // 奥の床の帯を、不透明な色 (rgb) のグラデーションで塗る
    const stops = calls.filter((c) => c.name === "addColorStop").map((c) => String(c.args[1]));
    expect(stops.some((s) => s.startsWith("rgb("))).toBe(true);
    for (const s of f.shapes.filter((x) => x.depth < 0.5)) expect(s.base).toBeGreaterThanOrEqual(B.height * 0.85 - 1);
  });
});
