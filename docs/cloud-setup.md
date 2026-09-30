# XPIKI setup

Set XPIKI_API_KEY in the private backend .env. Defaults are XPIKI_BASE_URL=https://api.xpiki.com/v1, XPIKI_MODEL=gpt-6-luna, and XPIKI_TIMEOUT_MS=5000. Never put the key in frontend variables or commit it. Google credentials are no longer required; the legacy Vertex adapter remains in source.

The backend uses the Responses API with strict JSON output, masked PNG inputs, and reasoning disabled for fast intent classification. A synthetic text classification took about 3.3 seconds with reasoning disabled in one local check; latency varies with provider load. Luna is a latency-oriented default, not a proven quality winner across every model.

Only reconstructed sanitized text and masked PNGs are sent to XPIKI. Requests set store=false; that flag does not establish the provider's retention policy. Timeouts, HTTP failures, refusals, incomplete responses and invalid JSON return uncertainty. Tests mock transport. Live verification uses synthetic sanitized context.
