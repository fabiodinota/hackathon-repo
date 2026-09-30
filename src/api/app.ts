import { Elysia } from "elysia";
import { PipelineError } from "../errors/pipeline-errors.js";
import { SessionError } from "../session/store.js";
import { intentRoutes, type IntentRouteDependencies } from "./intent-routes.js";
import { bearer, HttpError, json, matchesToken, readJson } from "./http.js";
import { loadCatalogue } from "../catalogue/loader.js";
import { CatalogueMatcher } from "../catalogue/matcher.js";
import type { KbcService, ServiceMatcher } from "../catalogue/types.js";
export type AppOptions = IntentRouteDependencies & {
  origins: string[];
  bootstrapToken: string;
  port: number;
  catalogue?: readonly KbcService[];
  matcher?: ServiceMatcher;
  now?: () => number;
};
export function createApp(options: AppOptions) {
  const { store } = options;
  const catalogue = options.catalogue ?? loadCatalogue();
  const matcher = options.matcher ?? new CatalogueMatcher({ now: options.now });
  const authorize = (request: Request) => {
    const id = request.headers.get("x-session-id") ?? "";
    store.authorize(id, bearer(request));
    return id;
  };
  return new Elysia()
    .onRequest(({ request, set }) => {
      const url = new URL(request.url);
      // Restrict the Host as well as Origin to resist DNS rebinding.
      if (
        !["127.0.0.1", "localhost"].includes(url.hostname) ||
        Number(url.port || 80) !== options.port
      )
        return json({ error: "FORBIDDEN_HOST" }, 403);
      set.headers["cache-control"] = "no-store";
      if (url.pathname === "/health" && request.method === "GET") return;
      let origin = request.headers.get("origin");
      if (
        !origin &&
        request.method === "GET" &&
        request.headers.get("sec-fetch-site") === "same-origin"
      ) {
        try {
          origin = new URL(request.headers.get("referer") ?? "").origin;
        } catch {}
      }
      if (!origin || !options.origins.includes(origin))
        return json({ error: "FORBIDDEN_ORIGIN" }, 403);
      set.headers["access-control-allow-origin"] = origin;
      set.headers.vary = "Origin";
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: {
            "access-control-allow-origin": origin,
            "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
            "access-control-allow-headers":
              "authorization,content-type,x-session-id",
            vary: "Origin",
          },
        });
      }
    })
    .onError(({ error }) => {
      if (error instanceof HttpError)
        return json({ error: error.code }, error.status);
      if (error instanceof SessionError)
        return json(
          { error: error.code },
          error.code === "UNAUTHORIZED"
            ? 401
            : error.code === "EXPIRED_SESSION"
              ? 410
              : 409,
        );
      if (error instanceof PipelineError)
        return json(
          { error: error.code },
          error.code === "PAYLOAD_TOO_LARGE"
            ? 413
            : error.code === "EXPIRED_SESSION"
              ? 410
              : 400,
        );
      return json({ error: "INVALID_REQUEST" }, 400);
    })
    .get("/health", () => json({ status: "ok" }))
    .post(
      "/api/session/start",
      async ({ request }) => {
        if (!matchesToken(bearer(request), options.bootstrapToken))
          throw new HttpError("UNAUTHORIZED", 401);
        const body = await readJson(request, 1024);
        if (
          !body ||
          typeof body !== "object" ||
          (body as Record<string, unknown>).consent !== true
        )
          throw new HttpError("CONSENT_REQUIRED", 400);
        return json(store.start(), 201);
      },
      { parse: "none" },
    )
    .post(
      "/api/session/pause",
      ({ request }) => {
        store.pause(authorize(request));
        return json({ status: "paused" });
      },
      { parse: "none" },
    )
    .post(
      "/api/session/resume",
      ({ request }) => {
        store.resume(authorize(request));
        return json({ status: "active" });
      },
      { parse: "none" },
    )
    .post(
      "/api/session/stop",
      ({ request }) => {
        store.stop(authorize(request));
        return json({ status: "stopped" });
      },
      { parse: "none" },
    )
    .post(
      "/api/context/pause",
      ({ request }) => {
        const id = authorize(request);
        store.pause(id);
        return json({ paused: store.isPaused(id) });
      },
      { parse: "none" },
    )
    .get("/api/context", ({ request }) => {
      const id = authorize(request);
      const context = store.getContext(id);
      return json({
        sessionId: id,
        intent: context?.intent ?? null,
        expiresAt: context?.expiresAt ?? null,
        paused: store.isPaused(id),
      });
    })
    .get("/api/services/recommendation", ({ request }) => {
      const id = authorize(request);
      if (store.isPaused(id))
        return json({ recommendation: null, alternatives: [], matched: false });
      const intent = store.get(id);
      return json(
        intent
          ? matcher.match(intent, catalogue)
          : { recommendation: null, alternatives: [], matched: false },
      );
    })
    .delete(
      "/api/context",
      ({ request }) => {
        store.delete(authorize(request));
        return json({ status: "cleared" });
      },
      { parse: "none" },
    )
    .use(intentRoutes(options));
}
