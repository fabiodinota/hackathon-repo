# Privacy sidecar boundary

Rust runs in its own container in the Compose stack. No Rust installation is needed on a teammate's machine.

- /health: transport is alive.
- /ready and POST /v1/sanitize: HTTP 503 until the real detector is connected.
- This scaffold performs no OCR, detection, or masking. It never echoes submitted data.
- Only the backend can reach it through the internal network at http://privacy:8081.
- Reuse Interdict's detector through an adapter. Its spans are UTF-8 byte offsets; map them to OCR boxes before masking.
- Return the existing SanitizedInput contract only after actual filtering, or a failure. Never pass raw data through as a fallback.
- Interdict is not copied or modified here. Retain its licensing when importing code.
