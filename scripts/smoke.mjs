import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
const probe = createServer();
await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
const port = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
const token = randomBytes(32).toString("hex");
const child = spawn("node_modules/.bin/bun", ["run", "src/server.ts"], {
  stdio: ["ignore", "pipe", "pipe"],
  env: {
    ...process.env,
    HOST: "127.0.0.1",
    PORT: String(port),
    SESSION_TOKEN: token,
    ALLOWED_ORIGINS: "http://localhost:5173",
  },
});
const base = "http://127.0.0.1:" + port;
try {
  let ready = false;
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(base + "/health")).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert(ready, "server did not become ready");
  const headers = {
    origin: "http://localhost:5173",
    "content-type": "application/json",
    authorization: "Bearer " + token,
  };
  const start = await fetch(base + "/api/session/start", {
    method: "POST",
    headers,
    body: JSON.stringify({ consent: true }),
  });
  assert.equal(start.status, 201);
  const session = await start.json();
  const sessionHeaders = {
    ...headers,
    authorization: "Bearer " + session.sessionToken,
    "x-session-id": session.sessionId,
  };
  assert.equal(
    (await fetch(base + "/api/context", { headers: sessionHeaders })).status,
    200,
  );
  assert.equal(
    (
      await fetch(base + "/api/session/pause", {
        method: "POST",
        headers: sessionHeaders,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await fetch(base + "/api/context", {
        method: "DELETE",
        headers: sessionHeaders,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await fetch(base + "/api/context", {
        headers: { ...sessionHeaders, origin: "https://invalid.example" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(base + "/api/context", {
        headers: { ...sessionHeaders, authorization: "Bearer invalid" },
      })
    ).status,
    401,
  );
  console.log(
    "Bun/Elysia smoke passed: health, consent, session, pause/delete, origin/token protection. No cloud calls.",
  );
} finally {
  child.kill("SIGTERM");
  await new Promise((resolve) => child.once("exit", resolve));
}
