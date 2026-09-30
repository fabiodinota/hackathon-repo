// Upscaling gives small UI text more pixels for OCR. Coordinates must map back
// to the untouched capture before redaction; the prepared image is never shown.
export function prepareOcrInput(source) {
  const maxPixels = 16_000_000;
  const scale = Math.max(
    1,
    Math.min(2, Math.sqrt(maxPixels / (source.width * source.height))),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(source.width * scale);
  canvas.height = Math.floor(source.height * scale);
  const context = canvas.getContext("2d");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.filter = "grayscale(1) contrast(1.15)";
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return {
    canvas,
    scaleX: canvas.width / source.width,
    scaleY: canvas.height / source.height,
  };
}

export function originalBox(bbox, scaleX, scaleY) {
  return {
    x: bbox.x0 / scaleX,
    y: bbox.y0 / scaleY,
    width: (bbox.x1 - bbox.x0) / scaleX,
    height: (bbox.y1 - bbox.y0) / scaleY,
  };
}

// Numeric diagnostics only: no recognized values, positions, or frame pixels.
export function confidenceSummary(ocr) {
  const words = Array.isArray(ocr?.words) ? ocr.words : [];
  const percent = (value) =>
    Number.isFinite(value) ? Math.round(value * 10) / 10 : null;
  return {
    overall: percent(ocr?.confidence),
    words: words.length,
  };
}
