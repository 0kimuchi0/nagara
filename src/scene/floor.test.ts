import { describe, expect, it } from "vitest";
import { mulberry32 } from "../random";
import { Floor } from "./floor";

const B = { width: 1200, height: 800 };

describe("Floor", () => {
  it("same seed gives same shapes, different seed differs", () => {
    const a = new Floor(B, mulberry32(7));
    const b = new Floor(B, mulberry32(7));
    const c = new Floor(B, mulberry32(8));
    expect(a.shapes).toEqual(b.shapes);
    expect(a.shapes).not.toEqual(c.shapes);
  });

  it("shapes stay within bounds, also after resize", () => {
    const f = new Floor(B, mulberry32(9));
    const check = (w: number, h: number) => {
      expect(f.shapes.length).toBeGreaterThan(0);
      for (const s of f.shapes) {
        expect(s.x).toBeGreaterThanOrEqual(0);
        expect(s.x + s.w).toBeLessThanOrEqual(w);
        expect(s.h).toBeGreaterThan(0);
        expect(s.h).toBeLessThanOrEqual(h * 0.12);
      }
    };
    check(1200, 800);
    f.resize({ width: 500, height: 300 });
    check(500, 300);
  });
});

describe("Floor resize stability", () => {
  it("resizing back and forth restores the same shapes", () => {
    const f = new Floor(B, mulberry32(10));
    const before = f.shapes.map((s) => ({ ...s }));
    f.resize({ width: 1920, height: 1080 });
    f.resize(B);
    expect(f.shapes).toEqual(before);
  });
});
