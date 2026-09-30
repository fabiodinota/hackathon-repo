import { test } from "node:test";
import assert from "node:assert/strict";
import { CaptureSession } from "../src/features/capture/capture.js";

test("live tick creates a canvas, runs OCR and publishes only after local detection", async () => {
  const originalDocument = globalThis.document;
  const originalFetch = globalThis.fetch;
  const calls = [];
  const frame = {
    width: 0,
    height: 0,
    getContext: () => ({
      drawImage() {
        calls.push("capture");
      },
      fillRect() {
        calls.push("mask");
      },
    }),
  };
  globalThis.document = {
    createElement(tag) {
      assert.equal(tag, "canvas");
      return frame;
    },
  };
  globalThis.fetch = async () => {
    calls.push("detector");
    return {
      ok: true,
      json: async () => ({
        status: "ok",
        matches: [{ category: "EMAIL", start: 0, end: 17 }],
      }),
    };
  };
  const events = [];
  const session = new CaptureSession((event) => events.push(event.status));
  session.controller = new AbortController();
  session.video = {
    readyState: 2,
    videoWidth: 400,
    videoHeight: 100,
    pause() {},
  };
  session.ocr = {
    async recognize() {
      calls.push("ocr");
      return {
        confidence: 99,
        words: [
          {
            text: "alex@example.test",
            confidence: 99,
            line: 0,
            box: { x: 10, y: 10, width: 180, height: 20 },
          },
        ],
      };
    },
    dispose() {},
  };
  try {
    await session.tick(session.epoch);
    assert.deepEqual(calls, ["capture", "ocr", "detector", "mask"]);
    assert.deepEqual(events, [
      "frame-captured",
      "ocr-start",
      "detector-start",
      "processed",
    ]);
    assert.equal(frame.width, 0);
    assert.equal(frame.height, 0);
  } finally {
    session.stop();
    globalThis.document = originalDocument;
    globalThis.fetch = originalFetch;
  }
});
