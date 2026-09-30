import { PrivacyError } from "../privacy/privacy.js";
import { prepareOcrInput, originalBox } from "../ocr/ocr-input.js";

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
      const worker = await createWorker("eng", 1, {
        workerPath: "/ocr/worker.min.js",
        corePath: "/ocr/core",
        langPath: "/ocr",
        cacheMethod: "none",
        logger: () => {},
      });
      if (signal.aborted || epoch !== this.epoch) {
        await worker.terminate();
        throw new PrivacyError("CANCELLED");
      }
      this.worker = worker;
    }
    const input = prepareOcrInput(canvas);
    let data;
    try {
      ({ data } = await this.worker.recognize(
        input.canvas,
        {},
        { blocks: true, text: false },
      ));
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
