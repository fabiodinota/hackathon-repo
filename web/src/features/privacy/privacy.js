const encoder = new TextEncoder();
// Demo threshold. OCR confidence does not measure redaction completeness.
export const MIN_CONFIDENCE = 40;
const categories = new Set([
  "EMAIL",
  "PHONE",
  "SSN",
  "ADDRESS",
  "CREDIT_CARD",
  "IBAN",
  "SWIFT",
  "AWS_KEY",
  "OPENAI_KEY",
  "GITHUB_TOKEN",
  "PRIVATE_KEY",
  "CREDENTIAL",
]);

export class PrivacyError extends Error {
  constructor(code) {
    super(code);
    this.name = "PrivacyError";
  }
}

// Byte offsets use the exact UTF-8 text that the Rust detector scans.
export function buildDocument(ocr, width, height) {
  if (
    !ocr ||
    !Array.isArray(ocr.words) ||
    !ocr.words.length ||
    ocr.words.length > 10000
  )
    throw new PrivacyError("OCR_EMPTY");
  if (!Number.isFinite(ocr.confidence) || ocr.confidence < MIN_CONFIDENCE)
    throw new PrivacyError("OCR_CONFIDENCE");
  let text = "";
  let byteOffset = 0;
  const words = ocr.words.map((word, index) => {
    if (typeof word.text !== "string" || !word.text.trim())
      throw new PrivacyError("OCR_TEXT");
    const box = word.box;
    if (
      !box ||
      ![box.x, box.y, box.width, box.height].every(Number.isFinite) ||
      box.x < 0 ||
      box.y < 0 ||
      box.width <= 0 ||
      box.height <= 0 ||
      box.x + box.width > width ||
      box.y + box.height > height
    )
      throw new PrivacyError("OCR_BOX");
    const separator =
      index === 0 ? "" : word.line === ocr.words[index - 1].line ? " " : "\n";
    text += separator;
    byteOffset += encoder.encode(separator).length;
    const start = byteOffset;
    text += word.text;
    byteOffset += encoder.encode(word.text).length;
    return { ...word, start, end: byteOffset };
  });
  if (byteOffset > 65536) throw new PrivacyError("OCR_TOO_LARGE");
  return { text, words, byteLength: byteOffset };
}

export function mapMasks(document, decision, width, height) {
  if (
    decision?.status !== "ok" ||
    !Array.isArray(decision.matches) ||
    decision.matches.length > 10000
  )
    throw new PrivacyError("DETECTOR_REJECTED");
  const boundaries = new Set([0]);
  let position = 0;
  for (const char of document.text) {
    position += encoder.encode(char).length;
    boundaries.add(position);
  }
  const boxes = new Map();
  for (const match of decision.matches) {
    if (
      !categories.has(match.category) ||
      !Number.isInteger(match.start) ||
      !Number.isInteger(match.end) ||
      match.start < 0 ||
      match.end <= match.start ||
      match.end > document.byteLength ||
      !boundaries.has(match.start) ||
      !boundaries.has(match.end)
    )
      throw new PrivacyError("SPAN_MAPPING");
    const covered = document.words.filter(
      (word) => word.start < match.end && word.end > match.start,
    );
    if (!covered.length) throw new PrivacyError("SPAN_MAPPING");
    // Only whitespace separators may lie between mapped boxes.
    const bytes = encoder.encode(document.text);
    for (let i = match.start; i < match.end; i++) {
      if (
        !covered.some((word) => i >= word.start && i < word.end) &&
        bytes[i] !== 32 &&
        bytes[i] !== 10
      )
        throw new PrivacyError("SPAN_MAPPING");
    }
    for (const word of covered) {
      const x = Math.max(0, Math.floor(word.box.x) - 4);
      const y = Math.max(0, Math.floor(word.box.y) - 4);
      boxes.set(word.start, {
        x,
        y,
        width: Math.min(width, Math.ceil(word.box.x + word.box.width) + 4) - x,
        height:
          Math.min(height, Math.ceil(word.box.y + word.box.height) + 4) - y,
      });
    }
  }
  return [...boxes.values()];
}

export async function inspectLocally(text, signal) {
  const response = await fetch("/privacy/v1/inspect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    cache: "no-store",
    credentials: "omit",
    signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
  });
  if (!response.ok) throw new PrivacyError("DETECTOR_UNAVAILABLE");
  return response.json();
}

// No OCR strings, thumbnails, or inferred customer intentions cross this boundary.
export function makePayload(mode, masks, matches) {
  return {
    schemaVersion: 1,
    source: mode,
    capturedAt: new Date().toISOString(),
    maskedRegions: masks.length,
    categories: [...new Set(matches.map((match) => match.category))],
  };
}
