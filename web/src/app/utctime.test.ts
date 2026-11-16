import { describe, expect, it } from "vitest";
import { hm, hms, parseDateTime, parseHms } from "./utctime";

describe("typed 24-hour UTC times", () => {
  it("reads hh:mm:ss, hh:mm, hhmmss and hhmm", () => {
    expect(parseHms("12:34:56")).toBe(12 * 3600 + 34 * 60 + 56);
    expect(parseHms("23:59")).toBe(23 * 3600 + 59 * 60);
    expect(parseHms("123456")).toBe(12 * 3600 + 34 * 60 + 56);
    expect(parseHms("0905")).toBe(9 * 3600 + 5 * 60);
    expect(parseHms(" 7 ")).toBe(7 * 3600);
  });

  it("rejects out-of-range and 12-hour times", () => {
    for (const bad of ["24:00", "12:60", "12:00:60", "1:30 PM", "noon", ""]) expect(parseHms(bad)).toBeNull();
  });

  it("formats seconds as hh:mm:ss", () => {
    expect(hm(0)).toBe("00:00");
    expect(hm(23 * 3600 + 50 * 60)).toBe("23:50");
    expect(hms(0)).toBe("00:00:00");
    expect(hms(12 * 3600 + 34 * 60 + 56)).toBe("12:34:56");
  });

  it("builds a UTC instant from yyyy-mm-dd and a time, and rejects impossible dates", () => {
    expect(parseDateTime("2027-03-17", "12:34:56").toISOString()).toBe("2027-03-17T12:34:56.000Z");
    expect(Number.isNaN(parseDateTime("2027-02-30", "00:00").getTime())).toBe(true);
    expect(Number.isNaN(parseDateTime("03/17/2027", "00:00").getTime())).toBe(true);
  });
});
