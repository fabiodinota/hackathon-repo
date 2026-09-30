# Docker quick start

Requires Docker Compose v2+ and Node.js for the one-time local setup helper.

```sh
node scripts/setup-local.mjs
docker compose up --build -d
```

Open http://localhost:5173. The page is an integration shell with a live backend health indicator; it is not the finished product flow. No cloud call is made at startup.

```sh
docker compose ps
docker compose logs --tail=50
node scripts/docker-smoke.mjs
docker compose down
```

Only stop this project's stack. Do not use system prune or remove other teams' containers.

## Cloud credentials

Set `XPIKI_API_KEY`, `XPIKI_BASE_URL`, and `XPIKI_MODEL` in `.env` for live analysis. Keep the key on the API container; never put it in frontend variables or an image.

```sh
docker compose up --build -d
```

Do not copy credentials into the repository or image. Without an Xpiki key, AI analysis returns uncertainty; the backend and frontend still start.

## Boundaries

- Web: React/Vite production build, served by unprivileged Nginx on host `127.0.0.1:5173`.
- API: existing Bun backend, internal port 3000. Docker sets `HOST=0.0.0.0` inside the container; native development still defaults to loopback.
- Privacy: independent Rust crate on internal port 8081. The image compiles it; the runtime contains only the binary. Sanitization intentionally returns 503 until its owner integrates the detector.
- No host source mounts, database, or data volumes. Sessions disappear when the API restarts.

## Checks

```sh
npm run typecheck
npm run lint
npm test
npm run smoke
(cd web && npm install --no-package-lock && npm run build)
(cd services/privacy && cargo fmt --check && cargo check --locked)
```
