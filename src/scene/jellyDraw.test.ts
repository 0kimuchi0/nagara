import { describe, expect, it } from "vitest";
import { drawJelly, type JellyPose } from "./jellyDraw";
import { Jellyfish } from "./jellyfish";
import { mulberry32 } from "../random";
import { NIGHT } from "../palette";
import { stubCtx } from "../test/stubCtx";

const pose: JellyPose = { x: 300, y: 200, unit: 50, pulse: 0.4, phase: 1, velX: 20, velY: -30 };

describe("drawJelly", () => {
  it("undoes its own translate/rotate and emits only finite numbers", () => {
    const { ctx, calls } = stubCtx();
    drawJelly(ctx, pose, 3.2, [90, 120, 190], 1);
    const tr = calls.filter((c) => c.name === "translate").map((c) => c.args as number[]);
    expect(tr).toHaveLength(2);
    expect(tr[0][0] + tr[1][0]).toBeCloseTo(0);
    expect(tr[0][1] + tr[1][1]).toBeCloseTo(0);
    const rot = calls.filter((c) => c.name === "rotate").map((c) => c.args[0] as number);
    expect(rot[0] + rot[1]).toBeCloseTo(0);
    for (const c of calls) {
      for (const a of c.args) if (typeof a === "number") expect(Number.isFinite(a)).toBe(true);
    }
  });

  it("never sets an rgba alpha outside 0..1", () => {
    const { ctx, calls } = stubCtx();
    drawJelly(ctx, { ...pose, velX: 400, velY: -400, pulse: 1 }, 10, [255, 205, 140], 1);
    const styles = calls
      .filter((c) => c.name === "set:fillStyle" || c.name === "set:strokeStyle")
      .map((c) => String(c.args[0]))
      .filter((v) => v.startsWith("rgba"));
    expect(styles.length).toBeGreaterThan(0);
    for (const s of styles) {
      const a = Number(s.slice(s.lastIndexOf(",") + 1, -1));
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(1);
    }
  });
});

describe("Jellyfish draw", () => {
  it("balances save/restore", () => {
    const j = new Jellyfish({ width: 1200, height: 800 }, mulberry32(3));
    for (let i = 0; i < 30; i++) j.update(1 / 60, { low: 0, high: 0, volume: 0.5, beat: i === 5, speed: 1 });
    const { ctx, calls } = stubCtx();
    j.draw(ctx, NIGHT);
    expect(calls.filter((c) => c.name === "save")).toHaveLength(1);
    expect(calls.filter((c) => c.name === "restore")).toHaveLength(1);
  });
});
