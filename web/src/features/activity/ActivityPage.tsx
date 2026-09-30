import { useEffect, useRef } from "react";
import { mountActivity } from "./controller.js";
import "./styles.css";
import "./overrides.css";

export function ActivityPage() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => mountActivity(root.current!), []);
  return (
    <div ref={root}>
      <main className="shell">
        <header>
          <div className="brand">
            <b>N</b> northstar
          </div>
          <span>● Synthetic demo / prototype</span>
        </header>
        <section className="hero">
          <div>
            <p className="eyebrow">Screen insights · permission first</p>
            <h1>
              Understand the moment.
              <br />
              <i>Respect the person.</i>
            </h1>
            <p className="lede">
              Explore how local screen capture and redaction could support
              banking guidance. This prototype sends nothing to a bank and does
              not infer your plans.
            </p>
          </div>
          <div className="seal">
            ⌁<strong>Local processing</strong>
            <small>no raw frame storage</small>
          </div>
        </section>
        <section className="grid">
          <article className="card">
            <div className="heading">
              <small>01</small>
              <div>
                <p className="eyebrow">Your control</p>
                <h2>Give tab access</h2>
              </div>
              <em id="consent-status">Not granted</em>
            </div>
            <p className="copy">
              While this page stays visible, inspect the selected browser tab
              about every 4 seconds. Text is read in your browser and checked by
              a Rust service on this device. Only a redacted preview and
              category counts appear here.
            </p>
            <label className="consent">
              <input id="consent" type="checkbox" />
              <span></span>I agree to temporary capture and local processing of
              my selected tab.
            </label>
            <div className="actions">
              <button id="start" disabled>
                Choose a tab →
              </button>
              <button id="pause" disabled>
                Pause
              </button>
              <button id="end" disabled>
                End access
              </button>
            </div>
            <div className="note">
              Pausing, ending access, hiding this page, or stopping browser
              sharing releases the tab. Starting again opens a new browser
              permission prompt.
            </div>
            <p className="copy warning">
              Use synthetic data for this demo. Pattern matching can miss
              secrets, names, images, and other private information, even when
              OCR confidence is high.
            </p>
          </article>
          <article className="card">
            <div className="heading">
              <small>02</small>
              <div>
                <p className="eyebrow">Local monitor</p>
                <h2>Redacted preview</h2>
              </div>
            </div>
            <p id="status" role="status" aria-live="polite">
              Waiting for a session
            </p>
            <div className="preview">
              <canvas
                id="preview"
                hidden
                aria-label="Screen frame after opaque redaction"
              ></canvas>
              <div id="empty" className="empty">
                No frame retained.
                <small>Run the synthetic demo or choose a tab.</small>
              </div>
            </div>
            <div className="capture-proof">
              <div className="proof-heading">
                <strong>Latest capture proof</strong>
                <span id="proof-state">No frame captured</span>
              </div>
              <canvas
                id="capture-proof"
                hidden
                aria-label="Most recent locally captured frame"
              ></canvas>
              <p id="proof-empty">
                A temporary in-memory copy appears here as soon as a shared tab
                provides a frame.
              </p>
              <small>
                Local-only diagnostic. It is never sent to Interdict and is
                cleared when access ends.
              </small>
            </div>
            <div className="metrics">
              <span>
                <b id="frames">0</b> processed frames
              </span>
              <span>
                <b id="masks">0</b> masked regions
              </span>
              <span>4s target interval</span>
            </div>
            <div className="demo-actions">
              <button id="fixture" className="fixture">
                Run prepared fixture ↗
              </button>
              <button id="fixture-rust" className="fixture">
                Test fixture with Interdict ↗
              </button>
            </div>
            <p className="note">
              Prepared mode uses matching screenshot, OCR, and detector
              fixtures. It never grants consent or reads your display. Interdict
              mode runs the real Rust detector.
            </p>
          </article>
        </section>
        <section className="pipeline">
          <div>
            <p className="eyebrow">03 · Privacy pipeline</p>
            <h2>Inspect. Mask. Discard.</h2>
            <p>
              Raw frames stay in memory. Uncertain frames are discarded. Only
              the local Rust detector receives OCR text.
            </p>
          </div>
          <div className="steps">
            <div>
              <b>01</b>
              <strong>Capture</strong>
              <small>
                Media Capture API
                <br />
                Private canvas
              </small>
            </div>
            <i></i>
            <div>
              <b>02</b>
              <strong>Read locally</strong>
              <small>
                Tesseract.js
                <br />
                <span id="confidence-floor"></span>
              </small>
            </div>
            <i></i>
            <div className="active">
              <b>03</b>
              <strong>Cover secrets</strong>
              <small>
                Interdict patterns
                <br />+ checksums
              </small>
            </div>
            <i></i>
            <div>
              <b>04</b>
              <strong>Preview</strong>
              <small>
                Opaque masks
                <br />
                No cloud request
              </small>
            </div>
          </div>
        </section>
        <section className="grid">
          <article className="card">
            <p className="eyebrow">Redaction activity</p>
            <h2>What happened locally</h2>
            <ul id="activity" className="activity" aria-live="polite"></ul>
          </article>
          <article className="card">
            <p className="eyebrow">Outgoing boundary · local preview only</p>
            <h2>Metadata without OCR values</h2>
            <pre id="payload"></pre>
            <p className="note">
              No screenshot, raw text, or customer intention is included in this
              payload. Nothing is uploaded.
            </p>
          </article>
        </section>
        <footer>
          Northstar prototype · browser tab capture · local Interdict service ·
          synthetic demonstration, not complete PII removal
        </footer>
      </main>
    </div>
  );
}
