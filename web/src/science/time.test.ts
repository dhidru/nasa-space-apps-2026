import { describe, expect, it } from "vitest";
import { checkLandingTime, formatUtc, parseUtc, snapLandingTime } from "./time";

// Worked examples from data-contract §2: Supported Span [2026-11-14T00:00:00Z, 2027-11-14T00:00:00Z), 10-minute grid.
describe("Landing Time", () => {
  it("round-trips the contract's UTC format", () => {
    expect(formatUtc(parseUtc("2027-03-01T00:00:00Z"))).toBe("2027-03-01T00:00:00Z");
  });

  it("accepts the first and last Landing Times of the Supported Span", () => {
    expect(() => checkLandingTime(parseUtc("2026-11-14T00:00:00Z"))).not.toThrow();
    expect(() => checkLandingTime(parseUtc("2027-11-13T23:50:00Z"))).not.toThrow();
  });

  it("rejects times outside the span or off the 10-minute grid", () => {
    expect(() => checkLandingTime(parseUtc("2026-11-13T23:50:00Z"))).toThrow(/Supported Span/);
    expect(() => checkLandingTime(parseUtc("2027-11-14T00:00:00Z"))).toThrow(/Supported Span/);
    expect(() => checkLandingTime(parseUtc("2027-03-01T00:05:00Z"))).toThrow(/10-minute/);
  });

  it("snaps a picked time to the nearest 10-minute step inside the span", () => {
    expect(formatUtc(snapLandingTime(parseUtc("2027-03-01T00:04:59Z")))).toBe("2027-03-01T00:00:00Z");
    expect(formatUtc(snapLandingTime(parseUtc("2027-03-01T00:05:00Z")))).toBe("2027-03-01T00:10:00Z");
    expect(formatUtc(snapLandingTime(parseUtc("2020-01-01T00:00:00Z")))).toBe("2026-11-14T00:00:00Z");
    expect(formatUtc(snapLandingTime(parseUtc("2030-01-01T00:00:00Z")))).toBe("2027-11-13T23:50:00Z");
  });
});
