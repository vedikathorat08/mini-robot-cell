import { describe, expect, it } from "vitest";
import { clientToSource, latencyOffsetMm, sourceToMm } from "./pickMath.js";

describe("clientToSource (display -> source pixels)", () => {
  it("maps a click on a 640x360 display of a 1280x720 source", () => {
    const rect = { left: 0, top: 0, width: 640, height: 360 };
    expect(clientToSource(480, 90, rect, 1280, 720)).toEqual({ u: 960, v: 180 });
  });

  it("subtracts the element offset on the page", () => {
    const rect = { left: 100, top: 50, width: 800, height: 450 };
    const { u, v } = clientToSource(500, 275, rect, 1280, 720);
    expect(u).toBeCloseTo(640);
    expect(v).toBeCloseTo(360);
  });

  it("gives the same source pixel at two display sizes", () => {
    const small = clientToSource(160, 90, { left: 0, top: 0, width: 320, height: 180 }, 1280, 720);
    const large = clientToSource(640, 360, { left: 0, top: 0, width: 1280, height: 720 }, 1280, 720);
    expect(small.u).toBeCloseTo(large.u);
    expect(small.v).toBeCloseTo(large.v);
  });
});

describe("sourceToMm (source pixels -> mm from centre)", () => {
  it("matches the worked example: +128 mm, -72 mm at 0.4 mm/px", () => {
    const { dx, dy } = sourceToMm(960, 180, 1280, 720, 0.4);
    expect(dx).toBeCloseTo(128);
    expect(dy).toBeCloseTo(-72);
  });

  it("returns zero at the image centre", () => {
    const { dx, dy } = sourceToMm(640, 360, 1280, 720, 0.4);
    expect(dx).toBeCloseTo(0);
    expect(dy).toBeCloseTo(0);
  });

  it("is positive downward (image y points down)", () => {
    expect(sourceToMm(640, 720, 1280, 720, 0.4).dy).toBeGreaterThan(0);
  });
});

describe("latencyOffsetMm", () => {
  it("is 50 mm for 0.25 m/s and 200 ms", () => {
    expect(latencyOffsetMm(0.25, 200)).toBeCloseTo(50);
  });

  it("converts ms to s (no off-by-1000 error)", () => {
    expect(latencyOffsetMm(0.25, 200)).not.toBeCloseTo(50000);
  });

  it("is zero with zero latency or zero speed", () => {
    expect(latencyOffsetMm(0.25, 0)).toBe(0);
    expect(latencyOffsetMm(0, 200)).toBe(0);
  });
});