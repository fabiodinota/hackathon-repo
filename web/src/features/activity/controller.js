import { CaptureSession } from "../capture/capture.js";
import { MIN_CONFIDENCE } from "../privacy/privacy.js";

export function mountActivity(root) {
  const $ = (id) => root.querySelector("#" + id);
  const listeners = new AbortController();
  const on = (target, event, callback) =>
    target.addEventListener(event, callback, { signal: listeners.signal });
  let consent = false;
  let running = false;
  let captureActive = false;
  let frames = 0;
  const session = new CaptureSession(update);

  function update(event) {
    if (event.status === "stopped") {
      running = false;
      captureActive = false;
      $("start").disabled = !consent;
      $("pause").disabled = true;
      $("end").disabled = true;
      clearPreview();
      clearCaptureProof();
      $("status").textContent = "Stopped";
      if (event.code && event.code !== "SESSION_STOPPED") {
        log("Capture stopped", reasons[event.code] || "Capture was stopped.");
      }
    } else if (event.status === "requesting" || event.status === "active") {
      running = true;
      captureActive = event.status === "active";
      $("start").disabled = true;
      $("pause").disabled = false;
      $("end").disabled = false;
      $("status").textContent =
        event.status === "requesting"
          ? "Choose a browser tab"
          : "Live · processing locally";
      log(
        event.status === "requesting"
          ? "Capture permission requested"
          : "Capture active",
        event.status === "requesting"
          ? "Choose a browser tab in the permission dialog."
          : "Frames are processed locally about every 4 seconds.",
      );
    } else if (
      event.status === "ocr-start" ||
      event.status === "detector-start"
    ) {
      $("status").textContent =
        event.status === "ocr-start"
          ? "Live · reading text locally"
          : "Live · checking patterns locally";
      log(
        event.status === "ocr-start"
          ? "OCR started"
          : "Interdict check started",
        event.status === "ocr-start"
          ? "The frame stays in this browser while Tesseract reads it."
          : "Only OCR text is sent to the loopback Rust sidecar; raw pixels stay here.",
      );
    } else if (event.status === "frame-captured") {
      showCaptureProof(event.frame);
      $("proof-state").textContent =
        event.width + "×" + event.height + " · awaiting local OCR";
      log(
        "Frame captured",
        "A local canvas frame is ready; it has not been shared.",
      );
    } else if (event.status === "processed") {
      const preview = $("preview");
      preview.width = event.frame.width;
      preview.height = event.frame.height;
      preview.getContext("2d").drawImage(event.frame, 0, 0);
      $("empty").hidden = true;
      preview.hidden = false;
      $("frames").textContent = ++frames;
      $("masks").textContent = event.payload.maskedRegions;
      $("payload").textContent = JSON.stringify(event.payload, null, 2);
      const fixture = event.payload.source !== "live";
      $("status").textContent = fixture
        ? event.payload.source === "synthetic-fixture"
          ? "Synthetic · prepared detector results"
          : "Synthetic · Rust Interdict"
        : "Live · redacted preview";
      log(
        "Frame processed",
        event.payload.categories.join(", ") || "No registered pattern matched",
      );
    } else if (event.status === "discarded") {
      clearPreview();
      clearCaptureProof();
      $("status").textContent = captureActive
        ? "Live · frame discarded"
        : "Frame discarded";
      log(
        "Frame discarded",
        event.code === "OCR_CONFIDENCE" && event.confidence
          ? confidenceMessage(event.confidence)
          : reasons[event.code] ||
              "Local processing failed. Nothing was published.",
      );
    }
  }

  function confidenceMessage(summary) {
    const score = (value) => (value === null ? "unavailable" : value + "%");
    return (
      "OCR confidence: overall " +
      score(summary.overall) +
      " across " +
      summary.words +
      " recognized words. The overall score must reach " +
      MIN_CONFIDENCE +
      "%. Individual word scores are not used as a discard condition. Try enlarging the shared tab’s text or use the prepared fixture."
    );
  }

  const reasons = {
    PAGE_HIDDEN:
      "The prototype page became hidden. Keep it visible in a separate window while sharing another tab.",
    SHARING_ENDED: "Browser sharing ended.",
    SHARING_MUTED: "The browser paused the shared track.",
    SURFACE_UNKNOWN:
      "This browser did not identify the shared surface. Try tab sharing in Chrome or Edge.",
    FRAME_UNAVAILABLE: "The shared tab has not provided a video frame yet.",
    OCR_CONFIDENCE: "OCR confidence below " + MIN_CONFIDENCE + "%.",
    OCR_BOX: "Invalid OCR bounding box.",
    OCR_EMPTY: "OCR returned no usable text.",
    OCR_TEXT: "OCR returned an invalid or empty text entry.",
    SPAN_MAPPING: "A detected span could not map safely.",
    DETECTOR_REJECTED: "Detector returned an incomplete or invalid decision.",
    DETECTOR_UNAVAILABLE: "Local Interdict is unavailable.",
    FRAME_SIZE: "Unsupported capture size.",
    TAB_REQUIRED:
      "Select a browser tab. Window and screen capture are not accepted.",
    CAPTURE_CANCELLED: "Screen sharing was cancelled or unavailable.",
    OCR_RUNTIME:
      "Local OCR could not start. Check that the local OCR assets are present, then reload.",
    CANCELLED: "Processing was cancelled before the frame was complete.",
    PROCESSING_FAILED:
      "The browser could not finish this frame. Try sharing a browser tab again.",
  };

  function clearPreview() {
    const preview = $("preview");
    preview.width = 0;
    preview.height = 0;
    preview.hidden = true;
    $("empty").hidden = false;
    $("payload").textContent = "No payload. No cloud endpoint is configured.";
    $("masks").textContent = "0";
  }

  function showCaptureProof(frame) {
    const proof = $("capture-proof");
    proof.width = frame.width;
    proof.height = frame.height;
    proof.getContext("2d").drawImage(frame, 0, 0);
    proof.hidden = false;
    $("proof-empty").hidden = true;
  }

  function clearCaptureProof() {
    const proof = $("capture-proof");
    proof.width = 0;
    proof.height = 0;
    proof.hidden = true;
    $("proof-empty").hidden = false;
    $("proof-state").textContent = "No frame captured";
  }

  function log(title, detail) {
    const time = new Date().toLocaleTimeString();
    // Log only fixed messages and validated categories, never frame/OCR objects.
    console.info("[Northstar]", time, title, detail);
    const row = document.createElement("li");
    const name = document.createElement("strong");
    name.textContent = time + " · " + title;
    const description = document.createElement("span");
    description.textContent = detail;
    row.append(name, description);
    $("activity").prepend(row);
    while ($("activity").children.length > 30)
      $("activity").lastElementChild.remove();
  }

  on($("consent"), "change", (event) => {
    consent = event.target.checked;
    if (!consent) session.stop();
    $("start").disabled = !consent || running;
    $("consent-status").textContent = consent ? "Granted" : "Not granted";
  });
  on($("start"), "click", () => {
    if (consent && !running) void session.start();
  });
  on($("pause"), "click", () => {
    session.stop();
    $("status").textContent = "Paused · start to select a tab again";
  });
  on($("end"), "click", () => {
    consent = false;
    $("consent").checked = false;
    $("consent-status").textContent = "Not granted";
    session.stop();
  });
  on($("fixture"), "click", () => void session.demo(false));
  on($("fixture-rust"), "click", () => void session.demo(true));
  on(window, "pagehide", () => session.stop());
  on(document, "visibilitychange", () => {
    // The permission picker itself can hide this page briefly. Do not cancel while
    // getDisplayMedia() is waiting for the user's selection; stop an active stream
    // only when the page is subsequently hidden.
    if (document.hidden && captureActive) session.stop("PAGE_HIDDEN");
  });
  clearPreview();
  clearCaptureProof();
  $("confidence-floor").textContent =
    MIN_CONFIDENCE + "% overall confidence floor (demo)";

  return () => {
    listeners.abort();
    session.stop();
  };
}
