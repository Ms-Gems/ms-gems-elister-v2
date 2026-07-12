import { describe, expect, test } from "vitest";
import {
  extractProductIdentifiers,
  hasCatalogIdentifier,
  validEan,
  validIsbn,
  validMpn,
  validUpc,
} from "@/lib/ebay/identifiers";
import type { ListingResult } from "@/lib/types";

const listing = (specifics: Record<string, string>): ListingResult => ({
  title: "T",
  description: "D",
  item_specifics: specifics,
});

describe("identifier validation", () => {
  test("accepts a valid UPC-A and rejects bad check digits", () => {
    expect(validUpc("036000291452")).toBe("036000291452");
    expect(validUpc("036000291453")).toBeNull();
    expect(validUpc("1234")).toBeNull();
  });

  test("accepts a valid EAN-13", () => {
    expect(validEan("4006381333931")).toBe("4006381333931");
    expect(validEan("4006381333932")).toBeNull();
  });

  test("all-zero codes pass the checksum but are rejected anyway", () => {
    expect(validUpc("000000000000")).toBeNull();
    expect(validEan("0000000000000")).toBeNull();
  });

  test("accepts ISBN-10 and ISBN-13, tolerating dashes", () => {
    expect(validIsbn("0-306-40615-2")).toBe("0306406152");
    expect(validIsbn("978-0-306-40615-7")).toBe("9780306406157");
    expect(validIsbn("0306406153")).toBeNull();
  });

  test("rejects placeholder and sentence-like MPNs", () => {
    expect(validMpn("A1428")).toBe("A1428");
    expect(validMpn("See photos")).toBeNull();
    expect(validMpn("not visible on the tag anywhere")).toBeNull();
  });
});

describe("extractProductIdentifiers", () => {
  test("pulls validated identifiers from item specifics", () => {
    const ids = extractProductIdentifiers(
      listing({ UPC: "036000291452", MPN: "GDC-100", ISBN: "" })
    );
    expect(ids).toEqual({ upc: "036000291452", mpn: "GDC-100" });
    expect(hasCatalogIdentifier(ids)).toBe(true);
  });

  test("a 13-digit 'UPC' is treated as an EAN, Bookland EAN doubles as ISBN", () => {
    const ids = extractProductIdentifiers(listing({ UPC: "9780306406157" }));
    expect(ids.ean).toBe("9780306406157");
    expect(ids.isbn).toBe("9780306406157");
  });

  test("invalid identifiers never reach eBay", () => {
    const ids = extractProductIdentifiers(
      listing({ UPC: "not visible", ISBN: "12345", MPN: "??" })
    );
    expect(ids).toEqual({});
    expect(hasCatalogIdentifier(ids)).toBe(false);
  });
});
