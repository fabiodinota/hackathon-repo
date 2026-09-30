# KBC Assist POC

Planning brief: describes the intended demo. For implemented routes and component status, see [the integration contract](docs/integration.md) and [component map](docs/architecture.md).

## Goal

- Detect what a user is trying to do from recent screen activity.
- Protect sensitive information before any cloud AI processing.
- Match the inferred intent to a relevant KBC service.
- Proactively notify the user with a useful suggestion.
- Demonstrate the full flow locally in a browser on macOS.

## Demo scenario

- User opens a mock property website.
- User opts into KBC Assist and shares that browser tab.
- User views property listings and a mortgage calculator.
- A fake IBAN or email is visible in the page to demonstrate redaction.
- The system captures a few frames and filters them locally.
- A fast cloud vision model analyzes only the sanitized context.
- The model identifies `home_purchase_planning`.
- The system searches the local KBC service catalogue.
- A browser notification recommends a mortgage simulation or home-buying checklist.
- Clicking the notification opens the mock KBC assistant.

## Architecture

```text
Mock browser activity
  -> consent and tab selection
  -> periodic frame capture
  -> local OCR with bounding boxes
  -> Interdict PII detection and validation
  -> opaque pixel masking
  -> sanitized frames and safe OCR
  -> fast cloud vision model
  -> structured intent JSON
  -> ephemeral local context store
  -> KBC service catalogue search and ranking
  -> browser notification
  -> mock KBC recommendation screen
```

## Components

### 1. Mock activity page

- Show realistic housing listings and a mortgage calculator.
- Include fake sensitive data such as `test@example.com` and a test IBAN.
- Provide enough visible signals for the AI to infer the scenario.
- Include a button to start the KBC Assist session.

### 2. KBC pre-flow and consent

- Explain what will be captured and why.
- Ask for explicit opt-in.
- Let the user select or confirm the browser tab.
- Show a persistent “KBC Assist is active” indicator.
- Include pause, stop, and delete-context controls.
- State that raw screenshots are not sent to KBC or the cloud model.

### 3. Capture service

- Use browser tab capture, for example `getDisplayMedia()`.
- Capture one frame every 3–5 seconds.
- Keep raw frames in memory only.
- Stop capture when the user pauses or ends the session.
- Use a prepared screenshot fixture as a fallback for the demo.

### 4. Local OCR

- Extract visible text from each frame.
- Return text, confidence, and pixel bounding boxes.
- Run locally before any cloud request.
- Use a fixture containing OCR output if live OCR becomes unreliable.

### 5. Interdict privacy filter

- Reuse Interdict’s pattern registry and streaming detector.
- Detect emails, phone numbers, IBANs, card numbers, and credentials.
- Reuse IBAN and card checksum validators.
- Map matching OCR spans to their bounding boxes.
- Cover matches with opaque masks, not reversible blur.
- Remove raw OCR values from the outgoing payload.
- Discard frames on OCR failure, low OCR confidence, or failed span-to-box mapping.
- Pattern matching cannot detect every secret; demonstrate with synthetic data and do not claim complete PII removal.
- Keep raw frames out of logs and persistent storage.

### 6. Sanitized context builder

- Keep only sanitized frames, safe OCR text, timestamps, and source metadata.
- Limit the context window to the latest 1–3 frames or 60 seconds.
- Resize images before upload.
- Never include raw screenshots, account numbers, names, passwords, or full screen history.

Example payload:

```json
{
  "safeText": ["3-bedroom apartment", "mortgage affordability calculator"],
  "frames": ["sanitized-frame-data"],
  "timeWindowSeconds": 60
}
```

### 7. Cloud AI intent service

- Use a Gemini Flash-Lite vision model through Vertex AI; verify availability and latency at setup.
- Keep cloud credentials in the local backend, never in browser code.
- Send only sanitized context.
- Request schema-constrained JSON.
- Infer the user’s likely goal, not identity or financial eligibility.
- Return `uncertain: true` when evidence is weak.
- Use a five-second timeout.
- On timeout or invalid output, return no suggestion; never fabricate a successful AI result.
- Treat visible webpage content as untrusted data, not instructions for the model.

Expected response:

```json
{
  "intent": "home_purchase_planning",
  "confidence": 0.91,
  "signals": ["Viewed property listings", "Used a mortgage calculator"],
  "uncertain": false
}
```

### 8. Ephemeral context store

- Store only the structured intent result.
- Keep it in memory for the POC.
- Expire context after approximately five minutes.
- Pause stops capture and new processing; delete also invalidates pending results so they cannot restore cleared context.
- Do not store screenshots or unredacted OCR.

### 9. KBC service catalogue

- Load [kbc-services.json](./kbc-services.json).
- Match the returned intent to service `intents` and `keywords`.
- Rank matching services by intent match and confidence.
- Return one primary recommendation and optionally one secondary option.
- Include a mock route and whether authentication would be required.
- Treat the catalogue as demo data, not an authoritative production inventory.

Example result:

```json
{
  "serviceId": "mortgage-simulation",
  "name": "Mortgage simulation",
  "reason": "Your recent activity suggests you are exploring home financing."
}
```

### 10. Proactive notification

- Trigger only for an unexpired catalogue match with `uncertain: false` and confidence at least 0.8 (a demo heuristic, not a calibrated probability).
- Request notification permission from a user click; use the browser Notifications API.
- Keep the assistant tab open, poll the context API, and focus its suggestion view when a notification is clicked.
- Keep notification text generic and free of sensitive data.
- Use a visible fallback toast if notifications are blocked.
- Do not repeatedly notify for the same intent.

Example:

```text
KBC Assist
We found something that may help with your home-buying journey.
```

### 11. Mock KBC assistant

- Show the detected need: “You may be planning to buy a home.”
- Show the recommended service: “Mortgage simulation.”
- Show safe supporting signals, not raw data.
- Explain that filtering happened locally.
- Provide buttons for open, dismiss, pause, and delete context.
- Show an empty state when confidence is too low.

## Local API

- `POST /api/session/start` — start a consented session.
- `POST /api/session/pause` — pause capture and processing.
- `POST /api/process-frame` — submit a captured frame to the local pipeline.
- `GET /api/context` — return the current intent and recommendation.
- `GET /api/explain` — return safe signals and processing status.
- `DELETE /api/context` — clear ephemeral context.
- Notifications run in the browser after polling `/api/context`; no notification endpoint is needed.
- Bind the backend to loopback; validate browser origins and require a session token for context and control endpoints.

## Required privacy rules

- Explicit opt-in before capture.
- Allowlisted tab or app only.
- Visible active-session indicator.
- Local OCR and PII filtering before cloud AI.
- Opaque redaction for detected sensitive regions.
- Fail closed: discard uncertain frames.
- No raw screenshots in logs, API responses, or persistent storage.
- No automatic banking transaction, application, or financial decision.
- User must manually open or accept any KBC service.

## Team split

- **Person 1 — Privacy pipeline:** capture, OCR fixture, Interdict detection, bounding-box masking, leak tests.
- **Person 2 — AI and backend:** Vertex AI call, intent schema, catalogue matching, local API, expiry logic.
- **Person 3 — Product demo:** mock browsing page, consent UI, mock KBC screen, notification, styling, demo recording.

## Four-hour scope

- Use one scenario: home-purchase planning.
- Use one browser tab instead of full phone-wide capture.
- Use one or three sanitized frames instead of continuous history.
- Use a catalogue JSON file instead of real KBC integrations.
- Use OCR fixtures only with their exact prepared screenshots; clearly label fixture mode. AI failure produces no suggestion.
- Avoid native iOS, Android, or macOS background capture.
- Avoid real KBC login, real customer data, transactions, and production deployment; retain local session protection.

## Demo acceptance checklist

- Consent is required before capture.
- Fake IBAN or email is visibly masked.
- Cloud request contains sanitized context only.
- AI returns structured intent JSON.
- A catalogue service is selected.
- Notification appears proactively.
- Mock KBC page explains the recommendation.
- Pause and delete work.
- API output contains no fake sensitive values.
- Aikido audit, README, screenshots, and under-three-minute demo video are ready.
