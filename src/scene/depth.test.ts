import { describe, expect, it } from "vitest";
import { DAY } from "../palette";
import { hazed, hazeOf, layerOf, scaleOf, waterAt } from "./depth";

describe("depth helpers", () => {
  it("splits layers at 0.5", () => {
    expect(layerOf(0)).toBe("far");
    expect(layerOf(0.49)).toBe("far");
    expect(layerOf(0.5)).toBe("near");
    expect(layerOf(1)).toBe("near");
  });
  it("far is hazier and smaller than near", () => {
    expect(hazeOf(0)).toBeGreaterThan(hazeOf(1));
    expect(hazeOf(1)).toBe(0);
    expect(scaleOf(0)).toBeLessThan(scaleOf(1));
  });
  it("a fully near color is unchanged; a far color moves toward the water", () => {
    const c: [number, number, number] = [255, 0, 0];
    expect(hazed(c, DAY, 0.5, 1)).toEqual(c);
    const far = hazed(c, DAY, 0.5, 0);
    const water = waterAt(DAY, 0.5);
    const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    expect(dist(far, water)).toBeLessThan(dist(c, water));
  });
});
