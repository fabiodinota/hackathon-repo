# Review handoff: components 6–9

## Mission

Perform a complete, read-only review of the implemented backend components 6–9. Confirm that sanitized screen context can move through intent analysis, ephemeral session storage, and KBC service matching without leaking sensitive data or producing unsafe recommendations. Review the actual code, tests, and integration seams; do not accept a prompt or TypeScript type as proof of privacy.

The reviewer must not edit files, commit, push, reset, clean, rebase, or change credentials. Report findings only. A later task can authorize fixes.

## Scope

- **6 — Sanitized context:** `src/context/` (`builder.ts`, policies, image validation, types, store).
- **7 — Intent AI:** `src/intent/` (Xpiki runtime provider, retained Vertex adapter, prompt, schema/validator, vocabulary, service).
- **8 — Session and ephemeral context:** `src/session/store.ts`, `src/context/store.ts`, session and intent routes, lifecycle tests.
- **9 — Catalogue and matching:** `src/catalogue/`, `kbc-services.json`, recommendation routes/tests.
- **Integration:** `src/api/`, `src/server.ts`, `src/config/`, `docs/integration.md`, Compose/Docker boundaries where they affect these components.

Components 1–5 are upstream dependencies. The Rust service now exposes Interdict inspection at /v1/inspect; browser modules map spans and mask pixels. Cloud handoff remains pending.

The runtime was changed to Xpiki during scaffolding. Verify the provider selected in `src/server.ts` at review time. Review both adapters and explicitly identify missing Xpiki-specific tests, response status/refusal handling, endpoint/redirect restrictions, and unsupported model options; passing Vertex mocks does not validate Xpiki.

## Baseline and repository safety

1. Record `git status --short`, current branch, `git log -5 --oneline`, and the remote SHA. Preserve concurrent work.
2. Read `POC_PLAN.md`, `README.md`, `docs/integration.md`, `docs/architecture.md`, and relevant source before judging behavior. The plan is intended scope; actual code determines implemented behavior.
3. Keep all review artifacts outside the repository or in an explicitly requested report. Do not add credentials, screenshots, generated builds, `.env`, ADC files, or dependency directories.
4. Treat `kbc-services.json` as mock demo data. Do not describe it as a verified or exhaustive KBC inventory.

## Required review questions

### 6. Sanitized context

- Are session IDs, frame IDs, timestamps, source labels, text lengths, frame counts, image bytes, dimensions, and total payloads bounded?
- Are future, expired, malformed, duplicate, and out-of-window frames handled safely? Is the newest-frame ordering correct?
- Does PNG validation reject non-PNG data, metadata chunks, malformed chunk lengths, oversized images, and data-URL prefixes? Does it prove only representation, rather than claiming pixels are PII-free?
- Are safe text and OCR confidence checks conservative? Are unknown properties excluded?
- Can raw OCR, screenshots, account numbers, names, credentials, hashes, provider bodies, or internal metadata reach logs, model payloads, API responses, or retained state?
- Does the adapter run only after upstream masking and fail closed when upstream confidence or span-to-box mapping is uncertain?

### 7. Intent AI

- Is the cloud request limited to rebuilt sanitized fields and approved PNGs? Confirm that arbitrary input properties cannot pass through.
- Are project, region, model, endpoint, token acquisition, timeout, abort, response-size, HTTP-status, JSON-parse, and malformed-candidate failures fail-closed to an uncertain result?
- Is the model output schema constrained and then independently validated against the closed vocabulary? Check confidence thresholds, null intent, signals, generated timestamps, and unknown fields.
- Is webpage text treated as untrusted evidence rather than model instructions? A system prompt alone is not an injection defense; identify any missing boundary or test.
- Are credentials backend-only and absent from browser bundles, logs, errors, and client responses?
- Are cloud assumptions clearly marked as unverified when no live Vertex request is made?

### 8. Session and ephemeral context

- Is explicit consent and bootstrap/session bearer authentication enforced? Check host, port, Origin, `X-Session-Id`, body/session consistency, and route-specific auth.
- Confirm one active analysis per session, pause/resume/stop/delete semantics, abort propagation, TTL expiry, and cleanup.
- Prove that delete or pause invalidates late uploads and provider results, including same-millisecond timestamps and resume-after-delete cases.
- Check session isolation, structured cloning/defensive copies, stale generations/leases, tombstones, and invalid context handling.
- Verify only validated intent projections are retained; no raw frames or untrusted recommendation text are stored.
- Confirm error responses do not expose provider errors, request bodies, tokens, or sensitive values.

### 9. Catalogue and recommendations

- Validate catalogue loading: JSON shape, required fields, duplicate IDs, unknown intents, unsafe paths, and malformed entries.
- Check ranking and tie behavior for intent matches, keyword matches, confidence/uncertain results, alternatives, and no-match cases.
- Ensure recommendations cannot be returned for null/uncertain/low-confidence intent.
- Confirm `path`, authentication flags, and reason text are treated as catalogue data and cannot become an open redirect, command, or financial eligibility claim.
- Check that the catalogue is clearly mock data and that the API exposes only the intended recommendation projection.

### Integration and container boundary

- Trace `POST /api/intent/analyze` through context building, provider/service validation, store lease/commit, catalogue matching, and `GET /api/context`.
- Check request body limits, content type handling, duplicate requests, provider failures, and status-code mapping.
- Verify Docker keeps the API and privacy service internal, publishes only the loopback web port, keeps credentials out of images, and accurately describes text inspection in Rust and pixel masking in the browser.

## Evidence and tests

Also review modularity, dependency direction, injected interfaces, duplicated validation/store ownership, configuration consistency, authored file sizes (target under 500 lines; ceiling 700), dependency/lockfile consistency, and CI coverage. Assess bounded memory, session growth, cleanup scheduling, request concurrency, timeout resource release, and latency. Separate demo blockers from future production improvements. Check documentation against actual request/response examples, including recommendation fields.

Run the existing checks without live cloud credentials:

```sh
npm run format:check
npm run typecheck
npm run lint
npm test
npm run smoke
docker compose config --quiet
git diff --check
(cd web && ../node_modules/.bin/bun run typecheck && ../node_modules/.bin/bun run build)
(cd services/privacy && cargo fmt --check && cargo check --locked)
```

Run `npm test`, not the incompatible native `bun test` runner. Use temporary reproduction scripts outside the checkout and injected fake providers/clocks to test failures and races. Build/check commands may create ignored output; source and Git state must remain unchanged. If Compose validation needs a missing token, supply a synthetic validation-only environment value; do not read or print credentials. Do not start or stop shared containers without checking ownership.

Use focused tests or small read-only scripts to reproduce every suspected issue. Do not send real screenshots or real PII. Live Xpiki/Vertex behavior is unverified unless credentials and an explicitly approved test environment are provided; label that limitation.

## Finding format

Order findings by severity: critical, high, medium, low, then informational. For each finding include:

- title and severity;
- exact file and line(s);
- trigger or minimal reproduction;
- security, privacy, correctness, or user impact;
- evidence from code/tests/commands;
- smallest safe fix, without implementing it;
- whether it is confirmed, suspected, or unverified due to missing cloud/upstream integration.

End with a short coverage statement: reviewed areas, commands run, remaining limitations, and whether components 6–9 are ready for the four-hour POC demo.
