import { describe, expect, it } from "vitest";
import { mulberry32 } from "../random";
import { Plants } from "./plants";
import type { Stimulus } from "./types";

const B = { width: 1200, height: 800 };
const silent: Stimulus = { low: 0, high: 0, volume: 0, beat: false, speed: 1 };

function maxTip(p: Plants, seconds: number, s: Stimulus): number {
  let max = 0;
  for (let f = 0; f < seconds * 60; f++) {
    p.update(1 / 60, s);
    for (let i = 0; i < p.count; i++) max = Math.max(max, Math.abs(p.tipOffset(i)));
  }
  return max;
}

describe("Plants", () => {
  it("count is round(width/40)", () => {
    expect(new Plants(B, mulberry32(1)).count).toBe(30);
  });

  it("low=1 sways further than low=0", () => {
    const calm = new Plants(B, mulberry32(3));
    const loud = new Plants(B, mulberry32(3));
    expect(maxTip(loud, 10, { ...silent, low: 1 })).toBeGreaterThan(maxTip(calm, 10, silent));
  });

  it("root x never changes on update", () => {
    const p = new Plants(B, mulberry32(4));
    const before = [...p.roots];
    maxTip(p, 5, { ...silent, low: 1 });
    expect([...p.roots]).toEqual(before);
  });

  it("re-lays out on resize: 40 plants within 0..1600", () => {
    const p = new Plants(B, mulberry32(5));
    p.resize({ width: 1600, height: 900 });
    expect(p.count).toBe(40);
    expect(p.roots.length).toBe(40);
    for (const x of p.roots) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(1600);
    }
  });
});
