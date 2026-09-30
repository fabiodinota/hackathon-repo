import { describe, expect, it } from "vitest";
import { IntentService } from "../src/intent/service.js";
import { validateIntent } from "../src/intent/validator.js";
import { input, valid, sensitive } from "./helpers.js";
import type { IntentResult } from "../src/intent/types.js";
describe("intent validation and service", () => {
  it("validates output, strips unknown fields and stamps server time", () => {
    const result = validateIntent(
      { ...valid, raw: sensitive(), generatedAt: "untrusted" },
      0.8,
      new Date(0),
    );
    expect(result).toEqual({
      ...valid,
      generatedAt: new Date(0).toISOString(),
    });
  });
  it("turns low confidence into empty uncertainty", () =>
    expect(validateIntent({ ...valid, confidence: 0.4 })).toMatchObject({
      intent: null,
      signals: [],
      uncertain: true,
    }));
  it.each([-1, 2, NaN, Infinity])("rejects confidence %s", (confidence) =>
    expect(() => validateIntent({ ...valid, confidence })).toThrow(),
  );
  it("rejects malformed JSON and missing or wrong fields", () => {
    for (const value of [
      "{bad",
      "[]",
      {},
      { ...valid, uncertain: "false" },
      { ...valid, signals: null },
      { ...valid, intent: undefined },
    ])
      expect(() => validateIntent(value)).toThrow();
  });
  it.each(sensitive())("rejects sensitive model output", (value) => {
    expect(() => validateIntent({ ...valid, signals: [value] })).toThrow();
    expect(() => validateIntent({ ...valid, intent: value })).toThrow();
  });
  it("rejects copied names and financial decisions by using a closed vocabulary", () => {
    expect(() =>
      validateIntent({ ...valid, signals: ["Customer has sufficient income"] }),
    ).toThrow();
    expect(() =>
      validateIntent({ ...valid, intent: "loan_approved" }),
    ).toThrow();
  });
  it("handles provider errors and invalid output without success", async () => {
    expect(
      (
        await new IntentService({
          analyze: async () => {
            throw new Error("private provider error");
          },
        }).analyze(input())
      ).uncertain,
    ).toBe(true);
    expect(
      (
        await new IntentService({
          analyze: async () => ({ confidence: 3 }) as IntentResult,
        }).analyze(input())
      ).uncertain,
    ).toBe(true);
  });
  it("times out and aborts the injected provider", async () => {
    let signal: AbortSignal | undefined;
    const service = new IntentService(
      {
        analyze: async (_context, s) => {
          signal = s;
          return new Promise(() => {});
        },
      },
      0.8,
      10,
    );
    expect(await service.analyze(input())).toMatchObject({
      intent: null,
      uncertain: true,
      signals: [],
    });
    expect(signal?.aborted).toBe(true);
  });
});
