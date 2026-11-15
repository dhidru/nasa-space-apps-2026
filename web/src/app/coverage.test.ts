import { describe, expect, it } from "vitest";
import { robustnessLabel } from "./coverage";

describe("robustnessLabel", () => {
  it("rounds down like the coverage percentages, but never shows a rare site as 0 %", () => {
    expect(robustnessLabel(0.379)).toBe("37 %");
    expect(robustnessLabel(1)).toBe("100 %");
    expect(robustnessLabel(0)).toBe("0 %");
    expect(robustnessLabel(0.004)).toBe("< 1 %");
  });
  it("shows a dash when the value wasn't computed", () => {
    expect(robustnessLabel(undefined)).toBe("—");
  });
});
