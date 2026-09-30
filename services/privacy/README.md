# Interdict privacy service

This Rust service reuses Interdict PatternRegistry, StreamingDetector, IBAN and Luhn validators. Cargo pins the kernel to revision 6dfcad4eb2f09493207e1c6e5a1c96d5df992c68 from https://github.com/fabiodinota/interdict.

GET /health and /ready report availability. POST /v1/inspect accepts JSON text and returns UTF-8 byte spans. Text is never echoed, logged or persisted. Invalid input and partial-only lines discard the frame. The browser validates spans before opaque masking. This replaces the old /v1/sanitize scaffold.

Native development binds 127.0.0.1:8081. Compose binds HOST=0.0.0.0 on the internal privacy network; no privacy port is published. Requests are bounded and timed out.

Run cargo run --locked --manifest-path services/privacy/Cargo.toml. Checks: cargo fmt, cargo test --locked and cargo clippy --locked. Docker installs CMake and Clang.

The locked kernel dependencies require Rust 1.96 or newer; the Docker builder uses Rust 1.98. Interdict retains its original proprietary license.
