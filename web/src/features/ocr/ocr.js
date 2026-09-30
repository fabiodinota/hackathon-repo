import { PrivacyError } from "../privacy/privacy.js";
import { prepareOcrInput, originalBox } from "../ocr/ocr-input.js";

// Tesseract promises do not settle when a worker is terminated. Race them with
// the session signal so stop/revoke returns immediately, and consume the late
// rejection to avoid an unhandled promise.
export async function raceWithAbort(
  promise,
  signal,
  timeoutMs = 0,
  timeoutCode = "CANCELLED",
) {
  promise.catch(() => {});
  if (signal.aborted) throw new PrivacyError("CANCELLED");
  let remove;
  let timer;
  const aborted = new Promise((_, reject) => {
    const onAbort = () => reject(new PrivacyError("CANCELLED"));
    remove = () => signal.removeEventListener("abort", onAbort);
    signal.addEventListener("abort", onAbort, { once: true });
  });
  const timedOut = timeoutMs
    ? new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new PrivacyError(timeoutCode)),
          timeoutMs,
        );
      })
    : null;
  try {
    return await Promise.race(
      timedOut ? [promise, aborted, timedOut] : [promise, aborted],
    );
  } finally {
    remove();
    clearTimeout(timer);
  }
}

export class LocalOcr {
  worker = null;
  epoch = 0;

  async recognize(canvas, signal) {
    const epoch = this.epoch;
    if (!this.worker) {
      const {
        default: { createWorker },
      } = await import("tesseract.js");
      if (signal.aborted || epoch !== this.epoch)
        throw new PrivacyError("CANCELLED");
      // All OCR assets are served locally. No CDN or cloud OCR calls.
      const workerPromise = createWorker("eng", 1, {
        workerPath: "/ocr/worker.min.js",
        corePath: "/ocr/core",
        langPath: "/ocr",
        cacheMethod: "none",
        logger: () => {},
      });
      let worker;
      try {
        worker = await raceWithAbort(
          workerPromise,
          signal,
          10000,
          "OCR_RUNTIME",
        );
      } catch (error) {
        void workerPromise
          .then((lateWorker) => lateWorker.terminate())
          .catch(() => {});
        throw error;
      }
      if (signal.aborted || epoch !== this.epoch) {
        await worker.terminate();
        throw new PrivacyError("CANCELLED");
      }
      this.worker = worker;
    }
    const input = prepareOcrInput(canvas);
    let data;
    try {
      const recognition = this.worker.recognize(
        input.canvas,
        {},
        { blocks: true, text: false },
      );
      try {
        ({ data } = await raceWithAbort(
          recognition,
          signal,
          30000,
          "OCR_RUNTIME",
        ));
      } catch (error) {
        if (error instanceof PrivacyError && error.message === "OCR_RUNTIME")
          this.dispose();
        throw error;
      }
    } finally {
      input.canvas.width = 0;
      input.canvas.height = 0;
    }
    if (signal.aborted || epoch !== this.epoch)
      throw new PrivacyError("CANCELLED");
    // tesseract.js v6 exposes words through blocks when explicitly requested.
    if (!Array.isArray(data.blocks)) throw new PrivacyError("OCR_EMPTY");
    const words = [];
    let line = 0;
    for (const block of data.blocks)
      for (const paragraph of block.paragraphs ?? []) {
        for (const row of paragraph.lines ?? []) {
          for (const word of row.words ?? []) {
            words.push({
              text: word.text,
              confidence: word.confidence,
              line,
              box: originalBox(word.bbox, input.scaleX, input.scaleY),
            });
          }
          line++;
        }
      }
    return { confidence: data.confidence, words };
  }

  dispose() {
    this.epoch++;
    const worker = this.worker;
    this.worker = null;
    if (worker) void worker.terminate().catch(() => {});
  }
}
