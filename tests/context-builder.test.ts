import { describe, expect, it } from "vitest";
import { ContextBuilder } from "../src/context/builder.js";
import { frame, input, now, png, sensitive } from "./helpers.js";
import type { SanitizedInput } from "../src/context/types.js";
const builder = () => new ContextBuilder({ now: () => now });
describe("ContextBuilder", () => {
  it("keeps only the newest three in order", () => {
    expect(
      builder()
        .build(input([frame(4), frame(1), frame(3), frame(2)]))
        .frames.map((f) => f.timestamp),
    ).toEqual([frame(1), frame(2), frame(3)].map((f) => f.timestamp));
  });
  it("deduplicates repeated frame ids before applying the frame cap", () => {
    const result = builder().build(
      input([
        frame(1, { id: "same", safeText: ["first"] }),
        frame(2, { id: "same", safeText: ["duplicate"] }),
        frame(3, { id: "other", safeText: ["second"] }),
        frame(4, { id: "third", safeText: ["third"] }),
      ]),
    );
    expect(result.frames.map((value) => value.safeText)).toEqual([
      ["first"],
      ["second"],
      ["third"],
    ]);
  });
  it("caps windows at 60 seconds and excludes every expired frame", () => {
    const result = builder().build({
      ...input([frame(1), frame(61)]),
      timeWindowSeconds: 1000,
    });
    expect(result.timeWindowSeconds).toBe(60);
    expect(result.frames).toHaveLength(1);
    expect(
      builder().build({
        ...input([frame(1), frame(20)]),
        timeWindowSeconds: 10,
      }).frames,
    ).toHaveLength(1);
  });
  it("rejects expired, malformed and empty sessions", () => {
    expect(() => builder().build(input([frame(61)]))).toThrow("expired");
    expect(() => builder().build(input([]))).toThrow();
    expect(() => builder().build({ ...input(), sessionId: "bad" })).toThrow();
    expect(() =>
      builder().build(input([frame(1, { safeText: [] })])),
    ).toThrow();
    expect(() => builder().build(input([frame(-1)]))).toThrow();
  });
  it("removes malformed frames, low OCR confidence and empty text", () => {
    const result = builder().build(
      input([
        null as never,
        frame(1, { ocrConfidence: 0.2 }),
        frame(2, { safeText: ["", " house "] }),
      ]),
    );
    expect(result.frames).toEqual([
      { timestamp: frame(2).timestamp, safeText: ["house"] },
    ]);
  });
  it("allowlists fields, excludes all raw OCR and metadata", () => {
    const values = sensitive();
    const result = builder().build({
      ...input([{ ...frame(), rawOcr: values, detector: { values } } as never]),
      rawImage: values,
    } as SanitizedInput);
    expect(Object.keys(result)).toEqual([
      "sessionId",
      "frames",
      "timeWindowSeconds",
    ]);
    expect(Object.keys(result.frames[0])).toEqual(["safeText", "timestamp"]);
    for (const value of values)
      expect(JSON.stringify(result)).not.toContain(value);
  });
  it.each(sensitive())(
    "discards a contaminated frame without transmitting values",
    (value) => {
      expect(() =>
        builder().build(input([frame(1, { safeText: ["house", value] })])),
      ).toThrow();
      const result = builder().build(
        input([frame(1, { safeText: [value] }), frame(2)]),
      );
      expect(JSON.stringify(result)).not.toContain(value);
    },
  );
  it("accepts bounded sanitized PNG and rejects malformed, oversized and metadata images", () => {
    expect(
      builder().build(input([frame(1, { imageBase64: png })])).frames[0]
        .imageBase64,
    ).toBe(png);
    expect(() =>
      new ContextBuilder({ now: () => now, maxImageBytes: 10 }).build(
        input([frame(1, { imageBase64: png })]),
      ),
    ).toThrow();
    expect(() =>
      builder().build(
        input([
          frame(1, {
            imageBase64: Buffer.from(sensitive().join(" ")).toString("base64"),
          }),
        ]),
      ),
    ).toThrow();
    const bytes = Buffer.from(png, "base64");
    bytes.write("tEXt", 37);
    expect(() =>
      builder().build(
        input([frame(1, { imageBase64: bytes.toString("base64") })]),
      ),
    ).toThrow();
  });
  it("rejects malformed chunk lengths and CRCs", () => {
    const bytes = Buffer.from(png, "base64");
    bytes[29] ^= 255;
    expect(() =>
      builder().build(
        input([frame(1, { imageBase64: bytes.toString("base64") })]),
      ),
    ).toThrow();
  });
  it("rejects payload beyond total byte budget", () => {
    expect(() =>
      new ContextBuilder({ now: () => now, maxPayloadBytes: 50 }).build(
        input(),
      ),
    ).toThrow("too large");
  });
});
