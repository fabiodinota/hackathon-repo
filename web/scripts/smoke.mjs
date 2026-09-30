import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1050 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(process.env.WEB_URL || "http://127.0.0.1:5173");
  await page.locator("#fixture-rust").click();
  await page.waitForFunction(() =>
    document.querySelector("#status").textContent.includes("Rust Interdict"),
  );
  assert.equal(await page.locator("#frames").textContent(), "1");
  assert.equal(await page.locator("#consent").isChecked(), false);
  const payload = JSON.parse(await page.locator("#payload").textContent());
  assert.deepEqual(
    new Set(payload.categories),
    new Set(["EMAIL", "PHONE", "IBAN", "CREDIT_CARD", "CREDENTIAL"]),
  );
  await page.screenshot({ path: "artifacts/desktop.png", fullPage: true });
  const ocrResult = await page.evaluate(async () => {
    const { LocalOcr } = await import("/src/features/ocr/ocr.js");
    const { buildDocument, mapMasks, inspectLocally } =
      await import("/src/features/privacy/privacy.js");
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 200;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, 1200, 200);
    ctx.fillStyle = "black";
    ctx.font = "40px Arial";
    ctx.fillText("alex@example.test", 40, 90);
    const ocr = new LocalOcr();
    try {
      const result = await ocr.recognize(canvas, new AbortController().signal);
      const document = buildDocument(result, canvas.width, canvas.height);
      const decision = await inspectLocally(
        document.text,
        new AbortController().signal,
      );
      return {
        confidence: result.confidence,
        words: result.words.length,
        masks: mapMasks(document, decision, 1200, 200).length,
        categories: decision.matches.map((m) => m.category),
      };
    } finally {
      ocr.dispose();
      canvas.width = 0;
      canvas.height = 0;
    }
  });
  assert.ok(ocrResult.words >= 1);
  assert.ok(ocrResult.masks >= 1);
  assert.ok(ocrResult.categories.includes("EMAIL"));
  const cancelled = await page.evaluate(async () => {
    const { CaptureSession } = await import("/src/features/capture/capture.js");
    const events = [];
    const session = new CaptureSession((e) => events.push(e.status));
    const original = window.fetch;
    window.fetch = (...args) =>
      new Promise((resolve, reject) =>
        setTimeout(() => original(...args).then(resolve, reject), 100),
      );
    try {
      const pending = session.demo(true);
      session.stop();
      await pending;
      return events.includes("processed");
    } finally {
      window.fetch = original;
    }
  });
  assert.equal(cancelled, false);
  // A fabricated low-confidence OCR result must be rejected before fetch.
  const rejected = await page.evaluate(async () => {
    const { buildDocument, MIN_CONFIDENCE } =
      await import("/src/features/privacy/privacy.js");
    try {
      buildDocument(
        {
          confidence: MIN_CONFIDENCE - 1,
          words: [
            {
              text: "secret",
              confidence: 99,
              box: { x: 1, y: 1, width: 100, height: 20 },
            },
          ],
        },
        200,
        100,
      );
      return false;
    } catch (error) {
      return error.message === "OCR_CONFIDENCE";
    }
  });
  assert.equal(rejected, true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "artifacts/mobile.png", fullPage: true });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        fixture: "passed",
        localOcr: ocrResult,
        cancellation: "passed",
        lowConfidence: "discarded",
        responsive: "passed",
        pageErrors: errors,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
