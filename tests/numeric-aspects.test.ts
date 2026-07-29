import { describe, expect, test } from "vitest";
import { sanitizeNumericAspects } from "@/lib/ebay/aspects";
import { findInvalidValueAspects } from "@/lib/ebay/publish";
import type { AspectMeta } from "@/lib/ebay/taxonomy";

const numberMeta = (name: string, format?: string): AspectMeta => ({
  name,
  required: false,
  usage: "RECOMMENDED",
  mode: "FREE_TEXT",
  cardinality: "SINGLE",
  dataType: "NUMBER",
  format,
  values: [],
});

const stringMeta = (name: string): AspectMeta => ({
  name,
  required: false,
  usage: "RECOMMENDED",
  mode: "FREE_TEXT",
  cardinality: "SINGLE",
  values: [],
});

describe("sanitizeNumericAspects", () => {
  test("drops prose values in NUMBER aspects — the Fabric Weight failure", () => {
    const aspects: Record<string, string[]> = { "Fabric Weight": ["Heavyweight"] };
    const dropped = sanitizeNumericAspects(aspects, [numberMeta("Fabric Weight", "double")]);
    expect(aspects["Fabric Weight"]).toBeUndefined();
    expect(dropped).toEqual(["Fabric Weight"]);
  });

  test("extracts the numeric token from a value with units", () => {
    const aspects: Record<string, string[]> = { "Fabric Weight": ["6.1 oz heavyweight"] };
    sanitizeNumericAspects(aspects, [numberMeta("Fabric Weight", "double")]);
    expect(aspects["Fabric Weight"]).toEqual(["6.1"]);
  });

  test("rounds int32 aspects to whole numbers", () => {
    const aspects: Record<string, string[]> = { "Number of Pieces": ["3.7 pieces"] };
    sanitizeNumericAspects(aspects, [numberMeta("Number of Pieces", "int32")]);
    expect(aspects["Number of Pieces"]).toEqual(["4"]);
  });

  test("drops zero and negative values — eBay requires greater than 0", () => {
    const aspects: Record<string, string[]> = { "Fabric Weight": ["0", "-2"] };
    const dropped = sanitizeNumericAspects(aspects, [numberMeta("Fabric Weight", "double")]);
    expect(dropped).toEqual(["Fabric Weight"]);
  });

  test("leaves STRING aspects and unknown aspects untouched", () => {
    const aspects: Record<string, string[]> = {
      Material: ["Heavyweight Cotton"],
      Theme: ["Vintage 90s"],
    };
    const dropped = sanitizeNumericAspects(aspects, [stringMeta("Material")]);
    expect(aspects.Material).toEqual(["Heavyweight Cotton"]);
    expect(aspects.Theme).toEqual(["Vintage 90s"]);
    expect(dropped).toEqual([]);
  });
});

describe("findInvalidValueAspects", () => {
  const resp = (message: string) => ({
    ok: false,
    status: 400,
    text: message,
    json: { errors: [{ errorId: 25002, message }] },
  });

  test("names the aspect from the real Fabric Weight publish error", () => {
    const aspects = { "Fabric Weight": ["Heavyweight"], Brand: ["Pro Club"] };
    const found = findInvalidValueAspects(
      resp(
        "A user error has occurred. Fabric weight must be greater than 0. Enter up to 1 number after the decimal."
      ),
      aspects
    );
    expect(found).toEqual(["Fabric Weight"]);
  });

  test("does not fire on BrandMPN tag errors — Brand needs a word boundary", () => {
    const aspects = { Brand: ["Pro Club"], MPN: ["Does Not Apply"] };
    const found = findInvalidValueAspects(
      resp("Input data for tag <BrandMPN> is invalid or missing."),
      aspects
    );
    expect(found).toEqual([]);
  });

  test("does not fire on missing-specific errors — those belong to extractMissingAspects", () => {
    const aspects = { Size: ["L"], Type: ["T-Shirt"] };
    const found = findInvalidValueAspects(
      resp("The item specific Size is missing and must be added."),
      aspects
    );
    expect(found).toEqual([]);
  });

  test("returns nothing when no sent aspect is named", () => {
    const aspects = { "Fabric Weight": ["6.1"] };
    const found = findInvalidValueAspects(
      resp("The listing price is invalid for this format."),
      aspects
    );
    expect(found).toEqual([]);
  });
});
