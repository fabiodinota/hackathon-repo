/* global EventTarget, Event */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mountActivity } from "../src/features/activity/controller.js";
import { CaptureSession } from "../src/features/capture/capture.js";

class Element extends EventTarget {
  children = [];
  width = 0;
  height = 0;
  hidden = false;
  getContext() { return { drawImage() {} }; }
  append(...children) { this.children.push(...children); }
  prepend(child) { this.children.unshift(child); }
}

test("discard clears captured pixels, preview and metadata", () => {
  const previous = { document: globalThis.document, window: globalThis.window, start: CaptureSession.prototype.start };
  const elements = new Map();
  const root = { querySelector(id) { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); } };
  globalThis.document = Object.assign(new EventTarget(), { createElement: () => new Element() });
  globalThis.window = new EventTarget();
  let session;
  CaptureSession.prototype.start = function () { session = this; };
  let cleanup;
  try {
    cleanup = mountActivity(root);
    const consent = root.querySelector("#consent");
    consent.checked = true;
    consent.dispatchEvent(new Event("change"));
    root.querySelector("#start").dispatchEvent(new Event("click"));
    session.onUpdate({ status: "active" });
    session.onUpdate({ status: "frame-captured", frame: { width: 800, height: 600 }, width: 800, height: 600 });
    assert.equal(root.querySelector("#capture-proof").width, 800);
    session.onUpdate({ status: "discarded", code: "DETECTOR_UNAVAILABLE" });
    for (const id of ["#capture-proof", "#preview"]) {
      const canvas = root.querySelector(id);
      assert.equal(canvas.width, 0); assert.equal(canvas.height, 0); assert.equal(canvas.hidden, true);
    }
    assert.equal(root.querySelector("#proof-empty").hidden, false);
    assert.equal(root.querySelector("#proof-state").textContent, "No frame captured");
    assert.equal(root.querySelector("#payload").textContent, "No payload. No cloud endpoint is configured.");
  } finally {
    cleanup?.(); globalThis.document = previous.document; globalThis.window = previous.window; CaptureSession.prototype.start = previous.start;
  }
});
