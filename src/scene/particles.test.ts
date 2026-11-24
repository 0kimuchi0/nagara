import { describe, expect, it } from "vitest";
import { mulberry32 } from "../random";
import { PARTICLE_COUNT, Particles } from "./particles";

const B = { width: 1200, height: 800 };

describe("Particles", () => {
  it("has the fixed count and stays in bounds for 30s", () => {
    const p = new Particles(B, mulberry32(1));
    expect(p.items.length).toBe(PARTICLE_COUNT);
    for (let i = 0; i < 30 * 60; i++) {
      p.update(1 / 60, { low: 0.5, high: 0.5, volume: 0.5, beat: false, speed: 1.5 });
    }
    expect(p.items.length).toBe(PARTICLE_COUNT);
    for (const it of p.items) {
      expect(it.x).toBeGreaterThanOrEqual(0);
      expect(it.x).toBeLessThanOrEqual(B.width);
      expect(it.y).toBeGreaterThanOrEqual(0);
      expect(it.y).toBeLessThanOrEqual(B.height);
    }
  });

  it("resize keeps particles inside new bounds", () => {
    const p = new Particles(B, mulberry32(2));
    p.resize({ width: 300, height: 200 });
    for (const it of p.items) {
      expect(it.x).toBeLessThanOrEqual(300);
      expect(it.y).toBeLessThanOrEqual(200);
    }
  });
});
