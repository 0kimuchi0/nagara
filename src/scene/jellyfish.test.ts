import { describe, expect, it } from "vitest";
import { mulberry32 } from "../random";
import { Jellyfish } from "./jellyfish";
import type { Stimulus } from "./types";

const silent: Stimulus = { low: 0, high: 0, volume: 0, beat: false, speed: 1 };
const DT = 1 / 60;

function run(j: Jellyfish, seconds: number, s: Stimulus = silent, check?: () => void) {
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    j.update(DT, s);
    check?.();
  }
}

describe("Jellyfish", () => {
  it("count is 2 below width 600, else 3", () => {
    expect(new Jellyfish({ width: 500, height: 600 }, mulberry32(1)).bodies.length).toBe(2);
    expect(new Jellyfish({ width: 1200, height: 800 }, mulberry32(1)).bodies.length).toBe(3);
  });

  it("a beat moves every jellyfish upward within 0.5s", () => {
    const j = new Jellyfish({ width: 1200, height: 800 }, mulberry32(2));
    run(j, 1);
    const before = j.bodies.map((b) => b.y);
    j.update(DT, { ...silent, beat: true });
    run(j, 0.5);
    j.bodies.forEach((b, i) => expect(b.y).toBeLessThan(before[i]));
  });

  it("beat contracts the bell smoothly, without a single-frame jump", () => {
    const j = new Jellyfish({ width: 1200, height: 800 }, mulberry32(3));
    run(j, 1);
    let prev = j.bodies.map((b) => b.pulse);
    let maxStep = 0;
    let peak = 0;
    j.update(DT, { ...silent, beat: true });
    for (let i = 0; i < 60; i++) {
      j.bodies.forEach((b, k) => {
        maxStep = Math.max(maxStep, Math.abs(b.pulse - prev[k]));
        peak = Math.max(peak, b.pulse);
      });
      prev = j.bodies.map((b) => b.pulse);
      j.update(DT, silent);
    }
    expect(peak).toBeGreaterThan(0.8);
    expect(maxStep).toBeLessThan(0.35);
  });

  it("x stays within [0,width] for 60s, bouncing off edges", () => {
    for (const width of [100, 500, 1200]) {
      const j = new Jellyfish({ width, height: 600 }, mulberry32(width));
      run(j, 60, silent, () => j.bodies.forEach((b) => {
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.x).toBeLessThanOrEqual(width);
      }));
    }
  });

  it("y stays within 10%..70% of height, even under repeated beats", () => {
    const H = 800;
    const j = new Jellyfish({ width: 1200, height: H }, mulberry32(5));
    for (let i = 0; i < 60 * 60; i++) {
      j.update(DT, { ...silent, beat: i % 20 === 0, speed: 1.5 });
      j.bodies.forEach((b) => {
        expect(b.y).toBeGreaterThanOrEqual(0.1 * H);
        expect(b.y).toBeLessThanOrEqual(0.7 * H);
        expect(b.pulse).toBeGreaterThanOrEqual(0);
        expect(b.pulse).toBeLessThanOrEqual(1);
      });
    }
  });

  it("resize puts everyone inside the new bounds immediately", () => {
    const j = new Jellyfish({ width: 1600, height: 900 }, mulberry32(6));
    run(j, 5);
    j.resize({ width: 800, height: 600 });
    expect(j.bodies.length).toBe(3);
    j.bodies.forEach((b) => {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x).toBeLessThanOrEqual(800);
      expect(b.y).toBeGreaterThanOrEqual(60);
      expect(b.y).toBeLessThanOrEqual(420);
    });
    j.resize({ width: 500, height: 600 });
    expect(j.bodies.length).toBe(2);
  });

  it("steady beats do not pin jellyfish at the top; they settle back after beats stop", () => {
    const H = 800;
    const j = new Jellyfish({ width: 1200, height: H }, mulberry32(7));
    const sum = j.bodies.map(() => 0);
    const min = j.bodies.map(() => Infinity);
    let n = 0;
    for (let i = 0; i < 30 * 60; i++) {
      j.update(DT, { ...silent, beat: i % 30 === 0 });
      if (i >= 25 * 60) {
        n++;
        j.bodies.forEach((b, k) => {
          sum[k] += b.y;
          min[k] = Math.min(min[k], b.y);
        });
      }
    }
    j.bodies.forEach((_, k) => {
      expect(min[k]).toBeGreaterThan(0.1 * H + 20);
      expect(sum[k] / n).toBeGreaterThan(0.1 * H + 60);
    });
    run(j, 10);
    j.bodies.forEach((b) => {
      expect(b.y).toBeGreaterThan(0.25 * H);
      expect(b.y).toBeLessThan(0.65 * H);
    });
  });
});

describe("Jellyfish spacing", () => {
  it("initial x positions are spread out", () => {
    const j = new Jellyfish({ width: 1200, height: 800 }, mulberry32(11));
    const xs = j.bodies.map((b) => b.x).sort((a, b) => a - b);
    expect(xs[1] - xs[0]).toBeGreaterThan(150);
    expect(xs[2] - xs[1]).toBeGreaterThan(150);
  });

  it("no two bells overlap horizontally while at similar depth, over 60s", () => {
    const W = 1200;
    const H = 800;
    const unit = Math.min(W, H) / 14;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const j = new Jellyfish({ width: W, height: H }, mulberry32(seed));
      run(j, 60, { ...silent, beat: false }, () => {
        const bs = j.bodies;
        for (let a = 0; a < bs.length; a++) {
          for (let c = a + 1; c < bs.length; c++) {
            if (Math.abs(bs[a].y - bs[c].y) < unit * 1.5) {
              expect(Math.abs(bs[a].x - bs[c].x)).toBeGreaterThan(unit * 2);
            }
          }
        }
      });
    }
  });
});

describe("Jellyfish trailing velocity", () => {
  it("smoothed velocity follows the direction of travel and rises on a beat", () => {
    const j = new Jellyfish({ width: 1200, height: 800 }, mulberry32(11));
    run(j, 3);
    const internal = j as unknown as { jellies: Array<{ vx: number; velX: number; velY: number }> };
    for (const b of internal.jellies) {
      if (Math.abs(b.vx) > 5) expect(Math.sign(b.velX)).toBe(Math.sign(b.vx));
    }
    j.update(DT, { ...silent, beat: true });
    run(j, 0.3);
    for (const b of internal.jellies) expect(b.velY).toBeLessThan(0);
  });
});
