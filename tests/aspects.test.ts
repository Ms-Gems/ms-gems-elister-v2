import { describe, expect, test } from "vitest";
import {
  cleanAspectValue,
  clipAspectValue,
  enforceCardinality,
  isPlaceholderValue,
  matchAllowed,
  splitAspectValues,
  canonicalizeAspectKeys,
} from "@/lib/ebay/aspects";
import type { AspectMeta } from "@/lib/ebay/taxonomy";

const meta = (over: Partial<AspectMeta>): AspectMeta => ({
  name: "X",
  required: false,
  usage: "OPTIONAL",
  mode: "FREE_TEXT",
  cardinality: "SINGLE",
  values: [],
  ...over,
});

describe("isPlaceholderValue", () => {
  test.each([
    "See tag in photos",
    "See listing photos for measurements",
    "Unknown",
    "unknown material",
    "N/A",
    "n/a",
    "Not visible",
    "not shown",
    "TBD",
    "check photos",
    "-",
    "???",
    "",
    "  ",
  ])("flags %j as placeholder", (v) => {
    expect(isPlaceholderValue(v)).toBe(true);
  });

  test.each(["Cotton", "Ralph Lauren", "Sterling Silver", "No Hood", "Multicolor", "Nylon blend"])(
    "keeps real value %j",
    (v) => {
      expect(isPlaceholderValue(v)).toBe(false);
    }
  );
});

describe("cleanAspectValue", () => {
  test("empties placeholder phrases", () => {
    expect(cleanAspectValue("See tag in photos")).toBe("");
  });
  test("clips long values at word boundary", () => {
    const long = "word ".repeat(30).trim();
    expect(cleanAspectValue(long).length).toBeLessThanOrEqual(65);
  });
  test("respects a per-aspect max length", () => {
    expect(cleanAspectValue("A".repeat(40), 30).length).toBeLessThanOrEqual(30);
  });
});

describe("splitAspectValues", () => {
  test("keeps every part of a compound material", () => {
    expect(splitAspectValues("Cotton / Polyester")).toEqual(["Cotton", "Polyester"]);
  });
  test("splits ampersand colors", () => {
    expect(splitAspectValues("Black & White")).toEqual(["Black", "White"]);
  });
  test("splits comma lists", () => {
    expect(splitAspectValues("Casual, Travel, Workwear")).toEqual([
      "Casual",
      "Travel",
      "Workwear",
    ]);
  });
  test("splits on ' and ' but not inside words", () => {
    expect(splitAspectValues("Sandals")).toEqual(["Sandals"]);
    expect(splitAspectValues("Red and Blue")).toEqual(["Red", "Blue"]);
  });
  test("flattens arrays and dedupes case-insensitively", () => {
    expect(splitAspectValues(["Red", "red", "Blue"])).toEqual(["Red", "Blue"]);
  });
  test("drops placeholder parts", () => {
    expect(splitAspectValues("Unknown")).toEqual([]);
  });
});

describe("enforceCardinality", () => {
  test("MULTI aspects keep several values, SINGLE collapse to first", () => {
    const aspects: Record<string, string[]> = {
      Material: ["Cotton", "Polyester"],
      Color: ["Black", "White"],
      Mystery: ["A", "B"],
    };
    enforceCardinality(aspects, [
      meta({ name: "Material", cardinality: "MULTI" }),
      meta({ name: "Color", cardinality: "SINGLE" }),
    ]);
    expect(aspects.Material).toEqual(["Cotton", "Polyester"]);
    expect(aspects.Color).toEqual(["Black"]);
    // Unknown to eBay's schema — MULTI can't be proven safe.
    expect(aspects.Mystery).toEqual(["A"]);
  });
});

describe("matchAllowed", () => {
  test("case-insensitive with singular/plural tolerance", () => {
    expect(matchAllowed("unisex adult", ["Unisex Adults", "Men"])).toBe("Unisex Adults");
  });
  test("null when nothing matches", () => {
    expect(matchAllowed("Purple", ["Red", "Blue"])).toBeNull();
  });
});

describe("canonicalizeAspectKeys", () => {
  test("rejoins compound allowed values that splitting broke apart", () => {
    const aspects: Record<string, string[]> = { Closure: ["Hook", "Eye"] };
    canonicalizeAspectKeys(aspects, [
      meta({ name: "Closure", mode: "SELECTION_ONLY", values: ["Zip", "Hook & Eye"] }),
    ]);
    expect(aspects.Closure).toEqual(["Hook & Eye"]);
  });
  test("snaps each valid value of a multi-value aspect", () => {
    const aspects: Record<string, string[]> = { Material: ["cotton", "polyester"] };
    canonicalizeAspectKeys(aspects, [
      meta({
        name: "Material",
        mode: "SELECTION_ONLY",
        cardinality: "MULTI",
        values: ["Cotton", "Polyester", "Wool"],
      }),
    ]);
    expect(aspects.Material).toEqual(["Cotton", "Polyester"]);
  });
  test("renames model keys to eBay's exact names", () => {
    const aspects: Record<string, string[]> = { "sleeve length": ["Long Sleeve"] };
    canonicalizeAspectKeys(aspects, [meta({ name: "Sleeve Length" })]);
    expect(aspects["Sleeve Length"]).toEqual(["Long Sleeve"]);
    expect(aspects["sleeve length"]).toBeUndefined();
  });
});
