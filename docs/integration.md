# Items 1–5 integration contract

React/Vite owns consent, capture, previews and notifications. Local OCR plus Rust/Interdict own detection, validation and opaque masking. Bun/Elysia owns context limits, sessions and cloud calls. Vertex interprets intent only; a separate matcher selects services.

No items 1–5 implementation was present. Implement SanitizedInputAdapter beside that pipeline and invoke it only after successful filtering. A source label or TypeScript type cannot prove redaction. Discard upstream frames on OCR, confidence or span-to-box mapping failure.

## Interdict interfaces inspected read-only

- PatternRegistry::with_defaults in crates/kernel/src/policy/patterns/mod.rs, with optional checksum validators.
- StreamingDetector::scan, ScanResult (NoMatch, PartialMatch, FullMatch) and Detection (category, start, end, confidence) in crates/kernel/src/policy/streaming/detector.rs.
- StreamingDetector::apply_redaction and RedactionEngine in crates/kernel/src/policy/redaction.rs.

Detection spans index UTF-8 bytes, not JavaScript UTF-16 characters. Item 5 must map spans correctly to OCR boxes. Do not forward raw text, hashes, detections or internal metadata. This backend adds no sidecar or competing detector.

## Session flow

1. Obtain explicit UI consent. POST /api/session/start with JSON containing consent:true, an allowlisted Origin and Authorization: Bearer LOCAL_PAIRING_TOKEN. LOCAL_PAIRING_TOKEN is the SESSION_TOKEN configured in backend .env.
2. Keep returned sessionId, sessionToken and expiresAt in browser memory. Sessions expire five minutes after creation; there is no automatic renewal.
3. Subsequent calls require Authorization: Bearer <returned sessionToken>, X-Session-Id: <returned sessionId> and an allowlisted Origin. Use the credentials returned by session startup, not the pairing token from .env. Trusted CLI clients must also explicitly provide Origin. The body sessionId must match the header.
4. POST /api/intent/analyze with sanitized input below; poll GET /api/context for the current intent. Match and notify only for a non-null, certain result meeting the product confidence threshold.
5. Stop/pause frontend capture when calling its corresponding control route. Delete must clear frontend history too. Backend pause/delete/stop aborts pending work and invalidates late results.

## Input

```ts
type SanitizedFrame = {
  id: string;
  imageBase64?: string;
  safeText: string[];
  timestamp: string;
  source: "allowlisted_tab";
  ocrConfidence?: number;
};
type SanitizedInput = {
  frames: SanitizedFrame[];
  timeWindowSeconds: number;
  sessionId: string;
};
```

- Timestamps must use canonical UTC new Date().toISOString(). Future and expired frames are excluded.
- Images are optional plain base64 PNGs without data-URL prefixes. Item 5 must mask, downscale to at most 1024 × 1024, and export a fresh Canvas PNG. Decoded size is limited to 1,200,000 bytes. Text/EXIF metadata is rejected. Text-only frames are valid.
- safeText is already-filtered OCR. Boundary-policy violations discard the whole frame. This conservative guard is not a replacement for Interdict.
- OCR confidence, when present, is normalized 0–1 and must be at least 0.8. Omission assumes item 5 enforced its threshold. Normalize libraries using a 0–100 scale upstream.
- Unknown properties are excluded. No usable frames returns a typed error. Only the newest three usable frames in the requested window (maximum 60 seconds) survive.
- The test fixtures are unit-test data, not a live OCR fallback. Refresh their timestamps/session IDs in tests. Product fixture mode must be clearly labelled and tied to its exact prepared screenshot upstream.

## Output and errors

```ts
type IntentResult = {
  intent: string | null;
  confidence: number;
  signals: string[];
  uncertain: boolean;
  generatedAt: string;
};
```

The reviewed vocabulary in src/intent/vocabulary.ts restricts intent and signals. Unexpected fields are stripped; invalid required values fail closed. Low confidence forces null intent and empty signals. The backend assigns generatedAt. Confidence is a demo heuristic, not a probability or financial decision.

GET /api/context returns an object with intent equal to IntentResult or null. Error responses contain only an error code: invalid/empty input 400; authentication 401; origin/host 403; paused/busy/stale request 409; expired 410; oversized body/context 413. Uploads authorized before a delete or pause are rejected with STALE_REQUEST (409), even after resume. Discard their captured frames; any new analysis must use fresh context. Only one analysis runs per session. Provider failure returns HTTP 200 with uncertainty and clears earlier suggestions. Raw provider errors never reach clients.

## Composition

createApp accepts a ContextBuilder, IntentService, EphemeralIntentStore, origin list, bootstrap token and port. IntentService takes a replaceable IntentProvider. VertexIntentProvider accepts injected fetch and credential suppliers for testing. HTTP route code has no prompt formatting knowledge.

If a teammate introduces session routes, reuse the same store or adapt their lifecycle to its invalidation semantics. Avoid separate stores with inconsistent pause/delete behavior. Keep origin/token protection when mounting routes. Bind only 127.0.0.1; hosts must match localhost/127.0.0.1 and the configured port.
