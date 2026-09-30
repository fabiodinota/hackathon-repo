import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildDocument,
  mapMasks,
  makePayload,
} from "../src/features/privacy/privacy.js";
const word = (text, x, line = 0, confidence = 99) => ({
  text,
  line,
  confidence,
  box: { x, y: line * 30, width: text.length * 8, height: 20 },
});
const doc = (words) => buildDocument({ confidence: 99, words }, 1000, 600);
const decision = (category, start, end) => ({
  status: "ok",
  matches: [{ category, start, end }],
});

test("demo gates on overall confidence, not individual word scores", () => {
  for (const confidence of [40, 44]) {
    assert.doesNotThrow(() =>
      buildDocument(
        { confidence, words: [word("demo", 0, 0, confidence)] },
        1000,
        600,
      ),
    );
  }
  assert.doesNotThrow(() =>
    buildDocument(
      { confidence: 44, words: [word("demo", 0, 0, 0)] },
      1000,
      600,
    ),
  );
  assert.throws(
    () =>
      buildDocument({ confidence: 39, words: [word("demo", 0)] }, 1000, 600),
    /OCR_CONFIDENCE/,
  );
});

test("74% overall retains zero-confidence words for detection and masking", () => {
  for (const confidence of [0, 39, null, NaN]) {
    const result = buildDocument(
      { confidence: 74, words: [word("alex@example.test", 0, 0, confidence)] },
      1000,
      600,
    );
    assert.equal(result.text, "alex@example.test");
    assert.equal(
      mapMasks(result, decision("EMAIL", 0, result.byteLength), 1000, 600)
        .length,
      1,
    );
  }
  assert.throws(() => doc([word("", 0)]), /OCR_TEXT/);
});

test("UTF-8 offsets map an email after accented characters", () => {
  const d = doc([word("€", 0), word("é@example.test", 30)]);
  assert.equal(d.text, "€ é@example.test");
  assert.equal(
    mapMasks(d, decision("EMAIL", 4, d.byteLength), 1000, 600).length,
    1,
  );
  assert.throws(
    () => mapMasks(d, decision("EMAIL", 5, d.byteLength), 1000, 600),
    /SPAN_MAPPING/,
  );
});
test("split card numbers mask every overlapping word", () => {
  const d = doc(
    ["4111", "1111", "1111", "1111"].map((t, i) => word(t, i * 50)),
  );
  const boxes = mapMasks(
    d,
    decision("CREDIT_CARD", 0, d.byteLength),
    1000,
    600,
  );
  assert.equal(boxes.length, 4);
  assert.equal(boxes[0].x, 0);
  assert.ok(boxes[1].width > 32);
});
test("line separators preserve detector offsets", () => {
  const d = doc([word("first", 0), word("second", 0, 1)]);
  assert.equal(d.text, "first\nsecond");
  assert.equal(d.words[1].start, 6);
});
test("rejects low, absent and nonfinite confidence and malformed boxes", () => {
  for (const confidence of [NaN, null])
    assert.throws(
      () =>
        buildDocument({ confidence, words: [word("secret", 0)] }, 1000, 600),
      /OCR_CONFIDENCE/,
    );
  assert.throws(
    () =>
      doc([
        { ...word("secret", 0), box: { x: -1, y: 0, width: 20, height: 20 } },
      ]),
    /OCR_BOX/,
  );
  assert.throws(() => buildDocument({ words: [] }, 1000, 600), /OCR_EMPTY/);
  assert.throws(
    () =>
      buildDocument({ confidence: 0, words: [word("secret", 0)] }, 1000, 600),
    /OCR_CONFIDENCE/,
  );
});
test("rejects missing decisions, malformed offsets, whitespace-only matches", () => {
  const d = doc([word("one", 0), word("two", 40)]);
  for (const invalid of [
    {},
    { status: "discard", matches: [] },
    decision("EMAIL", -1, 4),
    decision("EMAIL", 0, 999),
    decision("EMAIL", 3, 4),
    decision("<script>", 0, 3),
  ]) {
    assert.throws(() => mapMasks(d, invalid, 1000, 600));
  }
});
test("payload allowlist contains no raw text, screenshot, or inferred intent", () => {
  const p = makePayload(
    "live",
    [{}],
    [{ category: "EMAIL", value: "private@example.test", start: 0, end: 20 }],
  );
  assert.deepEqual(Object.keys(p), [
    "schemaVersion",
    "source",
    "capturedAt",
    "maskedRegions",
    "categories",
  ]);
  assert.ok(!JSON.stringify(p).includes("private"));
});
