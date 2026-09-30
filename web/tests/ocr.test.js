import { test } from "node:test";
import assert from "node:assert/strict";
import { raceWithAbort } from "../src/features/ocr/ocr.js";

test("abort settles recognition even when the terminated worker never replies", async () => {
  const controller = new AbortController();
  const result = raceWithAbort(new Promise(() => {}), controller.signal);
  controller.abort();
  await assert.rejects(result, /CANCELLED/);
});

test("a stalled OCR operation fails with a bounded diagnostic", async () => {
  await assert.rejects(
    raceWithAbort(
      new Promise(() => {}),
      new AbortController().signal,
      5,
      "OCR_RUNTIME",
    ),
    /OCR_RUNTIME/,
  );
});

test("successful OCR returns its result", async () => {
  assert.deepEqual(
    await raceWithAbort(
      Promise.resolve({ confidence: 91 }),
      new AbortController().signal,
    ),
    { confidence: 91 },
  );
});
