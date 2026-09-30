# KBC Assist POC

## Integrated local prototype

The React/Vite frontend now contains the screen-consent prototype, with browser tab capture, local Tesseract OCR and opaque masking. The Rust service uses the pinned Interdict detector.

- web/src/features/activity/: UI, consent, previews and activity log.
- web/src/features/capture/: capture lifecycle and synthetic fixtures.
- web/src/features/ocr/: local OCR and coordinate mapping.
- web/src/features/privacy/: span validation, masking and inspection client.
- services/privacy/: Rust Interdict adapter.
- src/: existing Bun/Elysia context, intent and session backend.

See [frontend setup](web/README.md), [privacy service](services/privacy/README.md), and [Docker setup](docs/docker.md).

Run the stack with node scripts/setup-local.mjs followed by docker compose up --build -d, then open http://localhost:5173. OCR assets are generated during the web image build; no sibling Interdict checkout is required. Upstream source retains its original license.

The UI preserves local preview mode. It does not submit frames to cloud analysis. Its demo OCR gate is 40% overall, with no per-word rejection; the existing backend retains its 80% confidence contract. Notifications and the explicit-consent cloud adapter remain future integration work.

## Existing intent backend

Backend for **items 6–9**: build short-lived sanitized context, interpret intent through a fast Xpiki vision model, and return validated JSON. One Bun + Elysia + TypeScript server runs on loopback. Capture, OCR and Interdict masking are integrated locally. Notifications and cloud handoff remain separate integration work.

## Install and run

Requires Node.js 22+. The project includes a local Bun executable, so a global Bun installation is optional.

```sh
npm install --no-package-lock
node scripts/setup-local.mjs
```

The setup helper creates a private `.env` with a random local pairing token and never overwrites an existing file. If you prefer to create it manually, use:

```sh
node -e 'console.log(require("node:crypto").randomBytes(32).toString("hex"))'
```

This is a local pairing token, not an AI credential. Enter it in the future local consent UI or a trusted API client; do not embed it in frontend source or log it. Set `XPIKI_API_KEY` in `.env` for live analysis, then run:

```sh
npm run dev
```

Bun loads .env. The server listens at http://127.0.0.1:3000. GET /health returns a status object. ALLOWED_ORIGINS defaults to http://localhost:5173. Without Xpiki configuration, analysis returns an uncertain result; there is no fake successful AI fallback.

## Integration

Read [the API contract](docs/integration.md). Session startup requires the local pairing token and explicit consent. The returned session ID and distinct session token are required for subsequent calls, together with an allowlisted Origin.

| Route                    | Purpose                                                      |
| ------------------------ | ------------------------------------------------------------ |
| POST /api/session/start  | Require pairing token and consent; issue session credentials |
| POST /api/intent/analyze | Accept already-sanitized frames; return only IntentResult    |
| GET /api/context         | Return the current intent or null                            |
| POST /api/session/pause  | Abort pending work, retain context, reject new analysis      |
| POST /api/session/resume | Allow processing again in an unexpired session               |
| DELETE /api/context      | Clear results and invalidate pending work                    |
| POST /api/session/stop   | Revoke and remove the session                                |

createApp composes the routes into one Elysia server. The independent contracts are ContextBuilder, IntentProvider and SanitizedInputAdapter. Do not add a second backend. Only home_purchase_planning and a reviewed set of generic signals are currently supported. Extend the vocabulary with tests to add scenarios.

## Checks

```sh
npm run format
npm run format:check
npm run lint
npm run typecheck
npm test
npm run smoke
```

Tests mock the provider and credentials. The smoke test starts the actual Bun/Elysia server on a temporary loopback port and checks session controls without cloud calls. CI runs the same checks. Authored modules remain below 500 lines. The generated Bun lockfile is the dependency pinning source; use bun install --frozen-lockfile when Bun is installed.

## Privacy and limits

- Newest three usable frames, at most 60 seconds old. Incoming windows may be narrower.
- Up to 1.2 MB decoded PNG per image, 4 MB total context JSON, 4.5 MB HTTP body, 20 incoming frames, 20 text entries per frame and 240 characters per text entry.
- Item 5 must mask and downscale images to at most 1024 × 1024 before submission. PNG metadata is rejected. This builder does not perform OCR or pixel redaction.
- Only structured intents and minimal session credentials/control state are stored. Everything is memory-only and expires after five minutes, with cleanup every ten seconds. Restart clears all state.
- Pause, delete and stop abort pending requests and discard late results. AI failure clears earlier suggestions.
- Conservative text guards catch common sensitive-value mistakes. **These guards and PNG checks do not prove arbitrary input is PII-free.** Use only synthetic demo data that passed the upstream privacy pipeline.
- Fixed output vocabulary prevents copied account values, names and arbitrary descriptions from reaching clients. Confidence is a demo heuristic, not a calibrated probability.

## Remaining integration work

The local capture/OCR/masking pipeline is integrated. A future SanitizedInput adapter must connect successfully masked frames to the existing session lifecycle, with explicit cloud consent and a compatible OCR confidence policy. The current UI does not bypass or invoke that boundary.

Live Xpiki availability, credentials, latency and recognition are unverified without a configured account. No screenshots, credentials, raw OCR or real personal data belong in Git. The tiny generated PNG in tests is a blank pixel, not a screenshot. Tests construct sensitive-looking synthetic values at runtime. The catalogue is mock data for a separate service matcher.

## Context and recommendations (components 8–9)

The Map-backed ContextStore retains a projection of component 7's validated intent vocabulary. Default TTL is five minutes; reads and periodic cleanup remove expired data. Returned values are copies. No screenshots, raw OCR, prompts, raw model responses or arbitrary personal text are retained. Recommendations are computed on read rather than stored.

GET /api/context preserves the existing nested IntentResult or null response, adding sessionId, expiresAt and paused. GET /api/services/recommendation returns recommendation, alternatives and matched. POST /api/context/pause aliases session pause. All routes reuse the session token, allowed Origin and loopback protection.

Pause retains current context while rejecting new processing and suppressing recommendations. Resume uses POST /api/session/resume. Delete invalidates in-flight processing and clears context. Session credentials expire five minutes after session creation and are not renewed; context expiry cannot exceed session expiry.

The catalogue loader validates kbc-services.json once at server startup, rejects duplicate IDs and unsafe paths, and returns deeply frozen data. This is demo data based on KBC categories, not an official or live KBC integration. ServiceMatcher ranks exact intent matches first, then keyword evidence from reviewed signals; ties preserve catalogue order. It returns one primary and up to two alternatives. Uncertain, missing, expired or below-threshold intent yields no recommendation. Reasons use fixed neutral wording, without eligibility decisions or transactions. Opening a local service route remains a manual frontend action.

ContextStore and ServiceMatcher are injectable interfaces; the authenticated session adapter owns async processing leases and cancellation. Direct ContextStore.set callers must capture createdAt before beginning asynchronous work; stale writes at or before deletion are discarded. The production route uses session generation checks as well. The clock, catalogue and matcher can be injected for testing. The current intent vocabulary supports only home_purchase_planning; new scenarios need reviewed signals and tests.
