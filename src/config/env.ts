import { randomBytes } from "node:crypto";
export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const integer = (name: string, fallback: number, max: number) => {
    const value = env[name] === undefined ? fallback : Number(env[name]);
    if (!Number.isInteger(value) || value < 1 || value > max)
      throw new Error("Invalid " + name);
    return value;
  };
  const host = env.HOST ?? "127.0.0.1";
  // Compose publishes only the web proxy on host loopback; API stays internal.
  if (!["127.0.0.1", "0.0.0.0"].includes(host))
    throw new Error("HOST must be 127.0.0.1 or 0.0.0.0");
  const origins = (
    env.ALLOWED_ORIGINS ?? "http://localhost:5173,http://127.0.0.1:5173"
  )
    .split(",")
    .map((s) => s.trim());
  if (
    origins.some((origin) => {
      try {
        const u = new URL(origin);
        return (
          u.origin !== origin ||
          !["localhost", "127.0.0.1"].includes(u.hostname) ||
          u.protocol !== "http:"
        );
      } catch {
        return true;
      }
    })
  )
    throw new Error("Invalid ALLOWED_ORIGINS");
  const threshold = Number(env.INTENT_CONFIDENCE_THRESHOLD ?? 0.8);
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1)
    throw new Error("Invalid confidence threshold");
  const sessionToken = env.SESSION_TOKEN ?? randomBytes(32).toString("hex");
  if (
    !/^[a-zA-Z0-9_-]{32,128}$/.test(sessionToken) ||
    sessionToken.includes("replace")
  )
    throw new Error("SESSION_TOKEN must be a random 32+ character token");
  return {
    host,
    port: integer("PORT", 3000, 65535),
    origins,
    sessionToken,
    threshold,
    timeoutMs: integer("XPIKI_TIMEOUT_MS", 10000, 10000),
    ttlMs: integer("CONTEXT_TTL_MS", 300000, 300000),
    context: {
      maxFrames: integer("CONTEXT_MAX_FRAMES", 3, 3),
      maxSeconds: integer("CONTEXT_MAX_SECONDS", 60, 60),
      maxImageBytes: integer("CONTEXT_MAX_IMAGE_BYTES", 1200000, 1200000),
      maxPayloadBytes: integer("CONTEXT_MAX_PAYLOAD_BYTES", 4000000, 4000000),
    },
    xpiki: {
      apiKey: env.XPIKI_API_KEY ?? "",
      baseUrl: env.XPIKI_BASE_URL ?? "https://api.xpiki.com/v1",
      model: env.XPIKI_MODEL ?? "gpt-6-luna",
    },
  };
}
