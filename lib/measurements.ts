// Structured parsing of the free-text `measurements` field the analysis model
// returns ("Waist 32 in, rise 11 in, inseam 29 in"). Publishing used to stuff
// the first 30 characters of that whole string into eBay's Inseam aspect —
// producing garbage like Inseam = "Waist 32 in, rise 11 in, ins". Now a
// measurement is only mapped to an eBay aspect when it was explicitly labeled.

export interface ParsedMeasurements {
  inseam?: string;
  waist?: string;
  rise?: string;
  chest?: string;
  length?: string;
  shoulder?: string;
  sleeve?: string;
  hip?: string;
}

// Each measurement key with the label spellings sellers/models actually use.
const MEASUREMENT_LABELS: [keyof ParsedMeasurements, RegExp][] = [
  ["inseam", /\binseam\b/i],
  ["waist", /\bwaist\b/i],
  ["rise", /\brise\b/i],
  ["chest", /\b(?:chest|bust|pit[\s-]?to[\s-]?pit|armpit[\s-]?to[\s-]?armpit|p2p)\b/i],
  ["shoulder", /\bshoulders?\b/i],
  ["sleeve", /\bsleeves?\b/i],
  ["hip", /\bhips?\b/i],
  ["length", /\b(?:length|long)\b/i],
];

// A numeric measurement with optional fraction and unit: 29, 29.5, 29 1/2, 29", 29 in.
const VALUE_RE = /(\d{1,3}(?:\.\d+)?(?:\s+\d\/\d)?)\s*(?:"|″|''|in(?:ch(?:es)?)?\.?\b|cm\b)?/;

function normalizeValue(raw: string, unitHint: string): string {
  const cm = /cm/i.test(unitHint);
  return `${raw.trim()} ${cm ? "cm" : "in"}`;
}

// Parse labeled measurements out of free text. Only values directly attached
// to a recognized label are returned — an unlabeled "29" is ignored rather
// than guessed at.
export function parseMeasurements(text: string | undefined): ParsedMeasurements {
  const out: ParsedMeasurements = {};
  const t = String(text || "").trim();
  if (!t) return out;

  for (const [key, labelRe] of MEASUREMENT_LABELS) {
    if (out[key]) continue;
    // Label followed (within a few chars: ":", "-", "of", "is", "approx") by a value.
    const re = new RegExp(
      labelRe.source + String.raw`[\s:=~-]*(?:approx\.?|about|is|of)?[\s:=~-]*` + VALUE_RE.source,
      "i"
    );
    const m = re.exec(t);
    if (!m) continue;
    // The numeric value is the only capture group in the combined pattern.
    const num = [...m].slice(1).reverse().find((g) => g && /^\d/.test(g));
    if (!num) continue;
    out[key] = normalizeValue(num, m[0]);
  }
  return out;
}
