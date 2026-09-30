import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

// Run after docker compose up --build -d --wait. Never invokes cloud analysis.
const env = await readFile(new URL("../.env", import.meta.url), "utf8");
const token = /^SESSION_TOKEN=(.+)$/m.exec(env)?.[1].trim();
assert(token, "Local SESSION_TOKEN is missing");
const port =
  process.env.WEB_PORT ?? /^WEB_PORT=(.+)$/m.exec(env)?.[1].trim() ?? "5173";
const base = "http://127.0.0.1:" + port;
assert.equal((await fetch(base + "/health")).status, 200);
assert.match(await (await fetch(base)).text(), /KBC Assist/);
const headers = {
  origin: base,
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
try {
  assert.equal(
    (await fetch(base + "/api/context", { headers: sessionHeaders })).status,
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
  execFileSync(
    "docker",
    [
      "compose",
      "exec",
      "-T",
      "api",
      "bun",
      "-e",
      'for (const path of ["/ready", "/v1/sanitize"]) { const r = await fetch("http://privacy:8081" + path, {method: path === "/ready" ? "GET" : "POST"}); if (r.status !== 503) process.exit(1); }',
    ],
    { stdio: "pipe" },
  );
  console.log(
    "Docker smoke passed: web, API proxy, session authorization, pause/delete, privacy scaffold rejection. No cloud calls.",
  );
} finally {
  await fetch(base + "/api/session/stop", {
    method: "POST",
    headers: sessionHeaders,
  });
}
