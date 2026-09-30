# Screen-consent frontend

The prototype is mounted in the React/Vite app. Feature folders separate activity UI, browser capture, local Tesseract OCR, and privacy span validation/masking under src/features/. Tests and OCR setup live under tests/ and scripts/.

Run npm install --no-package-lock, ./node_modules/.bin/bun install --cwd web --frozen-lockfile, npm --prefix web run prepare:ocr, and npm --prefix web run dev. In another terminal run cargo run --locked --manifest-path services/privacy/Cargo.toml; open http://127.0.0.1:5173.

OCR assets are served locally. Setup verifies the English model checksum and Docker runs setup during the web image build. Prepared fixture uses synthetic data; Interdict fixture calls the real Rust detector. Live capture requires explicit consent and a browser-tab selection; other surfaces are rejected.

The demo requires 40% overall OCR confidence and masks validated Interdict spans with opaque rectangles. Local preview does not submit frames to the cloud intent endpoint; the backend SanitizedInput/session contract remains the future handoff.

Checks: npm --prefix web test, npm --prefix web run build, and npm run smoke with web and Rust services running.

The backend keeps its 80% input confidence policy. Individual word scores do not reject the local demo frame. Pattern matching cannot guarantee complete PII removal. Generated OCR assets and synthetic screenshots are ignored by Git. Browser smoke requires Chromium installed via npx playwright install chromium in web/. For an alternate port, set ALLOWED_ORIGINS on Rust and WEB_URL for the smoke test. The OS/browser permission picker needs manual verification.
