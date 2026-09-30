import { LocalOcr } from "../ocr/ocr.js";
import {
  buildDocument,
  mapMasks,
  inspectLocally,
  makePayload,
  PrivacyError,
} from "../privacy/privacy.js";
import { confidenceSummary } from "../ocr/ocr-input.js";
import { createFixture } from "./fixtures.js";

export class CaptureSession {
  constructor(onUpdate) {
    this.onUpdate = onUpdate;
    this.epoch = 0;
    this.ocr = new LocalOcr();
  }

  stop(reason = "SESSION_STOPPED") {
    this.epoch++;
    clearTimeout(this.timer);
    this.controller?.abort();
    this.controller = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    if (this.video) {
      this.video.pause();
      this.video.srcObject = null;
      this.video = null;
    }
    this.ocr.dispose();
    this.onUpdate({ status: "stopped", code: reason });
  }

  async start() {
    this.stop();
    const epoch = this.epoch;
    this.controller = new AbortController();
    this.onUpdate({ status: "requesting" });
    let stream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "browser", frameRate: 1 },
        audio: false,
      });
      if (epoch !== this.epoch) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.stream = stream;
      const track = stream.getVideoTracks()[0];
      // Ask the browser for a tab; reject other surfaces even if offered by its picker.
      const surface = track.getSettings().displaySurface;
      if (!surface) throw new PrivacyError("SURFACE_UNKNOWN");
      if (surface !== "browser") throw new PrivacyError("TAB_REQUIRED");
      track.addEventListener("ended", () => this.stop("SHARING_ENDED"), {
        once: true,
      });
      track.addEventListener("mute", () => this.stop("SHARING_MUTED"), {
        once: true,
      });
      this.video = document.createElement("video");
      this.video.muted = true;
      this.video.playsInline = true;
      this.video.srcObject = stream;
      await this.video.play();
      if (epoch !== this.epoch) return;
      this.onUpdate({ status: "active" });
      void this.tick(epoch);
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      if (epoch !== this.epoch) return;
      this.stop();
      this.onUpdate({
        status: "discarded",
        code:
          error instanceof PrivacyError ? error.message : "CAPTURE_CANCELLED",
      });
    }
  }

  async tick(epoch) {
    const started = performance.now();
    let frame;
    let confidence;
    try {
      if (epoch !== this.epoch || !this.video || this.video.readyState < 2)
        throw new PrivacyError("FRAME_UNAVAILABLE");
      const width = this.video.videoWidth,
        height = this.video.videoHeight;
      if (!width || !height || width * height > 16000000)
        throw new PrivacyError("FRAME_SIZE");
      frame = document.createElement("canvas");
      frame.width = width;
      frame.height = height;
      frame.getContext("2d").drawImage(this.video, 0, 0);
      this.onUpdate({ status: "frame-captured", frame, width, height });
      const signal = this.controller.signal;
      this.onUpdate({ status: "ocr-start" });
      const ocr = await this.ocr.recognize(frame, signal);
      if (epoch !== this.epoch) return;
      confidence = confidenceSummary(ocr);
      const ocrDocument = buildDocument(ocr, width, height);
      this.onUpdate({ status: "detector-start" });
      const decision = await inspectLocally(ocrDocument.text, signal);
      if (epoch !== this.epoch) return;
      this.publish(frame, ocrDocument, decision, "live");
    } catch (error) {
      if (epoch === this.epoch) {
        const code = classifyError(error);
        console.warn("[Northstar] frame discarded", code);
        this.onUpdate({ status: "discarded", code, confidence });
      }
    } finally {
      if (frame) {
        frame.width = 0;
        frame.height = 0;
      }
      // Serialized work: never queue a second raw frame while OCR is in progress.
      if (epoch === this.epoch)
        this.timer = setTimeout(
          () => void this.tick(epoch),
          Math.max(0, 4000 - (performance.now() - started)),
        );
    }
  }

  async demo(useSidecar = false) {
    this.stop();
    const epoch = this.epoch;
    this.controller = new AbortController();
    const fixture = createFixture();
    try {
      const document = buildDocument(
        fixture.ocr,
        fixture.canvas.width,
        fixture.canvas.height,
      );
      const decision = useSidecar
        ? await inspectLocally(document.text, this.controller.signal)
        : fixture.decision;
      if (epoch === this.epoch)
        this.publish(
          fixture.canvas,
          document,
          decision,
          useSidecar ? "synthetic-interdict" : "synthetic-fixture",
        );
    } catch (error) {
      if (epoch === this.epoch)
        this.onUpdate({
          status: "discarded",
          code:
            error instanceof PrivacyError
              ? error.message
              : "DETECTOR_UNAVAILABLE",
        });
    } finally {
      fixture.canvas.width = 0;
      fixture.canvas.height = 0;
    }
  }

  publish(frame, document, decision, mode) {
    const masks = mapMasks(document, decision, frame.width, frame.height);
    // Mutate only after every match has mapped successfully. This canvas is never shown raw.
    const context = frame.getContext("2d");
    context.fillStyle = "#101820";
    for (const box of masks)
      context.fillRect(box.x, box.y, box.width, box.height);
    this.onUpdate({
      status: "processed",
      frame,
      payload: makePayload(mode, masks, decision.matches),
    });
  }
}

// Convert implementation failures into a small, non-sensitive diagnostic
// vocabulary. Never send the original error, OCR text, or frame data to the UI.
function classifyError(error) {
  if (error instanceof PrivacyError) return error.message;
  const message = String(error?.message || error?.name || "").toLowerCase();
  if (
    message.includes("tesseract") ||
    message.includes("worker") ||
    message.includes("traineddata") ||
    message.includes("wasm")
  )
    return "OCR_RUNTIME";
  if (
    message.includes("fetch") ||
    message.includes("network") ||
    message.includes("failed to fetch") ||
    message.includes("sidecar")
  )
    return "DETECTOR_UNAVAILABLE";
  if (message.includes("abort") || message.includes("cancel"))
    return "CANCELLED";
  if (
    message.includes("canvas") ||
    message.includes("video") ||
    message.includes("drawimage") ||
    message.includes("invalidstate")
  )
    return "FRAME_UNAVAILABLE";
  return "PROCESSING_FAILED";
}
