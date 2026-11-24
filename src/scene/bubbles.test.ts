import { describe, expect, it } from "vitest";
import { mulberry32 } from "../random";
import { Bubbles, MAX_BUBBLES } from "./bubbles";
import type { Stimulus } from "./types";

const B = { width: 1200, height: 800 };
const silent: Stimulus = { low: 0, high: 0, volume: 0, beat: false, speed: 1 };

function run(b: Bubbles, seconds: number, s: Stimulus) {
  const dt = 1 / 60;
  for (let i = 0; i < seconds * 60; i++) b.update(dt, s);
}

describe("Bubbles", () => {
  it("silent 10s keeps 1..15 bubbles", () => {
    const b = new Bubbles(B, mulberry32(1));
    run(b, 10, silent);
    expect(b.count).toBeGreaterThanOrEqual(1);
    expect(b.count).toBeLessThanOrEqual(15);
  });

  it("high=1 yields more bubbles than silence, never above max", () => {
    const quiet = new Bubbles(B, mulberry32(2));
    const loud = new Bubbles(B, mulberry32(2));
    run(quiet, 10, silent);
    run(loud, 10, { ...silent, high: 1 });
    expect(loud.count).toBeGreaterThan(quiet.count);
    expect(loud.count).toBeLessThanOrEqual(MAX_BUBBLES);
  });

  it("never exceeds max under extreme input", () => {
    const b = new Bubbles(B, mulberry32(3));
    for (let i = 0; i < 600; i++) {
      b.update(1 / 60, { low: 1, high: 50, volume: 1, beat: true, speed: 3 });
      expect(b.count).toBeLessThanOrEqual(MAX_BUBBLES);
    }
  });

  it("beat adds 8 bubbles, capped", () => {
    const b = new Bubbles(B, mulberry32(4));
    const before = b.count;
    b.update(0, { ...silent, beat: true });
    expect(b.count).toBe(before + 8);
    for (let i = 0; i < 30; i++) b.update(0, { ...silent, beat: true });
    expect(b.count).toBe(MAX_BUBBLES);
  });

  it("bubbles rise and are removed above the top", () => {
    const b = new Bubbles(B, mulberry32(5));
    b.update(0, { ...silent, beat: true });
    const y0 = b.items.map((i) => i.y);
    b.update(0.1, silent);
    const y1 = b.items.map((i) => i.y);
    expect(y1.length).toBeGreaterThan(0);
    for (let i = 0; i < y1.length; i++) expect(y1[i]).toBeLessThan(y0[i]);
    // let everything leave with no new spawns possible beyond silence rate
    run(b, 30, silent);
    for (const it of b.items) expect(it.y).toBeGreaterThanOrEqual(0);
  });
});
