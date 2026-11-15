// Test helpers: compare documents we compute with the Python fixtures, field by field.
import { expect } from "vitest";
import { tolerance } from "./fixtures";

/** Every number within its field's tolerance, everything else equal; reports the path of the first mismatch. */
export function expectClose(actual: unknown, expected: unknown, path = "$"): void {
  if (typeof expected === "number") {
    expect(typeof actual, path).toBe("number");
    if (Math.abs((actual as number) - expected) > tolerance(path)) expect(actual, path).toBe(expected);
  } else if (Array.isArray(expected)) {
    expect(Array.isArray(actual), path).toBe(true);
    expect((actual as unknown[]).length, path + ".length").toBe(expected.length);
    expected.forEach((v, i) => expectClose((actual as unknown[])[i], v, `${path}[${i}]`));
  } else if (expected !== null && typeof expected === "object") {
    expect(Object.keys(actual as object).sort(), path + " keys").toEqual(Object.keys(expected).sort());
    for (const [k, v] of Object.entries(expected)) expectClose((actual as any)[k], v, `${path}.${k}`);
  } else {
    expect(actual, path).toBe(expected);
  }
}
