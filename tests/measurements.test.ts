import { describe, expect, test } from "vitest";
import { parseMeasurements } from "@/lib/measurements";

describe("parseMeasurements", () => {
  test("extracts labeled pants measurements — the audit's exact failure case", () => {
    const m = parseMeasurements("Waist 32 in, rise 11 in, inseam 29 in");
    expect(m.inseam).toBe("29 in");
    expect(m.waist).toBe("32 in");
    expect(m.rise).toBe("11 in");
  });

  test("handles colon and inch-mark formats", () => {
    expect(parseMeasurements('Inseam: 29"').inseam).toBe("29 in");
    expect(parseMeasurements("inseam - 30 inches").inseam).toBe("30 in");
  });

  test("understands pit-to-pit as chest", () => {
    expect(parseMeasurements("Pit to pit 21 in, length 27 in")).toMatchObject({
      chest: "21 in",
      length: "27 in",
    });
  });

  test("keeps decimals and cm units", () => {
    expect(parseMeasurements("waist 29.5 cm").waist).toBe("29.5 cm");
  });

  test("a range before the unit keeps the right unit", () => {
    expect(parseMeasurements("waist 70-72 cm").waist).toBe("70 cm");
    expect(parseMeasurements("inseam approx 29-30 in").inseam).toBe("29 in");
  });

  test("returns nothing for unlabeled numbers or placeholder text", () => {
    expect(parseMeasurements("29 31 42")).toEqual({});
    expect(parseMeasurements("See listing photos for measurements")).toEqual({});
    expect(parseMeasurements("")).toEqual({});
    expect(parseMeasurements(undefined)).toEqual({});
  });
});
