# KBC Assist POC

Local hackathon proof of concept. Items 6–7 provide a sanitized context builder and a Vertex AI intent service. The frontend, OCR, privacy filter and service matcher are separate team responsibilities.

Use synthetic demonstration data only. Pattern filtering cannot guarantee complete PII removal. Cloud credentials belong in the backend.

## Local backend

```sh
cp .env.example .env
npm install
npm run typecheck
npm test
npm run dev
```

The backend listens on loopback and exposes POST /api/intent/analyze. Send a JSON body matching SanitizedInput and Authorization: Bearer SESSION_TOKEN. The route returns only IntentResult; safe error codes never include prompts, screenshots, OCR, or provider output. Context contains at most the newest three allowlisted frames, is capped at 60 seconds and size limits, and is held only in memory. Intent results expire after five minutes. Pause/delete integration must call EphemeralIntentStore.pause/delete so pending or cleared results cannot reappear.

Items 1–5 must send frames after local OCR and Interdict redaction using the SanitizedFrame/SanitizedInput contract in src/context/types.ts. Vertex credentials remain server-side. Timeouts, provider errors, malformed JSON, and invalid confidence yield uncertain=true and no intent. Confidence is a demo heuristic, not a calibrated probability. The service does not perform KBC catalogue matching or notifications.
