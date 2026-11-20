import { describe, expect, it } from 'vitest';
import {
  DAY,
  EVENING,
  MORNING,
  NIGHT,
  currentHour,
  lightingAt,
  parseHourOverride,
} from './palette';
import { mulberry32 } from './random';

function maxRgbDiff(a: ReturnType<typeof lightingAt>, b: ReturnType<typeof lightingAt>): number {
  let m = 0;
  for (const key of ['waterTop', 'waterBottom', 'ray', 'plant'] as const) {
    for (let i = 0; i < 3; i++) m = Math.max(m, Math.abs(a[key][i] - b[key][i]));
  }
  return m;
}

describe('lightingAt', () => {
  it('returns each period constant at period-pure hours', () => {
    expect(lightingAt(7)).toEqual(MORNING);
    expect(lightingAt(13)).toEqual(DAY);
    expect(lightingAt(17.5)).toEqual(EVENING);
    expect(lightingAt(23)).toEqual(NIGHT);
    expect(lightingAt(2)).toEqual(NIGHT);
  });

  it('blends to the midpoint at a boundary hour', () => {
    const mid = (MORNING.rayIntensity + DAY.rayIntensity) / 2;
    expect(lightingAt(10).rayIntensity).toBeCloseTo(mid, 10);
  });

  it('is continuous over the whole day including the 24h wrap', () => {
    for (let i = 0; i < 2400; i++) {
      const d = maxRgbDiff(lightingAt(i * 0.01), lightingAt((i + 1) * 0.01));
      expect(d).toBeLessThanOrEqual(2);
    }
    expect(maxRgbDiff(lightingAt(23.99), lightingAt(0))).toBeLessThanOrEqual(2);
  });

  it('makes night slower and glowier than day', () => {
    expect(NIGHT.speed).toBeLessThan(DAY.speed);
    expect(NIGHT.jellyGlow).toBeGreaterThan(DAY.jellyGlow);
  });
});

describe('parseHourOverride', () => {
  it('parses valid hours', () => {
    expect(parseHourOverride('?hour=20')).toBe(20);
    expect(parseHourOverride('?hour=20.5')).toBe(20.5);
    expect(parseHourOverride('?hour=0')).toBe(0);
  });

  it('rejects invalid input', () => {
    expect(parseHourOverride('?hour=abc')).toBeNull();
    expect(parseHourOverride('?hour=25')).toBeNull();
    expect(parseHourOverride('?hour=24')).toBeNull();
    expect(parseHourOverride('?hour=-1')).toBeNull();
    expect(parseHourOverride('?hour=')).toBeNull();
    expect(parseHourOverride('')).toBeNull();
  });
});

describe('currentHour', () => {
  it('uses the clock when there is no override', () => {
    expect(currentHour(new Date(2026, 0, 1, 14, 30), null)).toBe(14.5);
  });
  it('prefers the override', () => {
    expect(currentHour(new Date(2026, 0, 1, 14, 30), 3)).toBe(3);
  });
});

describe('mulberry32', () => {
  it('is deterministic and within [0, 1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 1000; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
