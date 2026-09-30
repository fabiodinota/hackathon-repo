import { createApp } from "./api/app.js";
import { ContextBuilder } from "./context/builder.js";
import { loadConfig } from "./config/env.js";
import { IntentService } from "./intent/service.js";
import { VertexIntentProvider } from "./intent/vertex-provider.js";
import { EphemeralIntentStore } from "./session/store.js";
const config = loadConfig();
const provider = new VertexIntentProvider({
  ...config.vertex,
  timeoutMs: config.timeoutMs,
  threshold: config.threshold,
});
const store = new EphemeralIntentStore(config.ttlMs);
const app = createApp({
  builder: new ContextBuilder(config.context),
  service: new IntentService(provider, config.threshold, config.timeoutMs),
  store,
  origins: config.origins,
  bootstrapToken: config.sessionToken,
  port: config.port,
});
const timer = setInterval(() => store.cleanup(), 10000);
timer.unref();
app.listen({
  hostname: config.host,
  port: config.port,
  maxRequestBodySize: 4_500_000,
  idleTimeout: 10,
});
const stop = async () => {
  clearInterval(timer);
  store.dispose();
  await app.stop();
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
// Static operational output only. Never log data, credentials, or errors from providers.
console.log("KBC Assist listening on loopback port " + config.port);
