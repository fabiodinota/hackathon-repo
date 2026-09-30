import { Elysia } from "elysia";
import type { ContextBuilder } from "../context/builder.js";
import type { SanitizedInput } from "../context/types.js";
import type { IntentService } from "../intent/service.js";
import type { EphemeralIntentStore } from "../session/store.js";
import { bearer, HttpError, json, readJson } from "./http.js";
export type IntentRouteDependencies = {
  builder: ContextBuilder;
  service: IntentService;
  store: EphemeralIntentStore;
};
export function intentRoutes(deps: IntentRouteDependencies) {
  return new Elysia().post(
    "/api/intent/analyze",
    async ({ request }) => {
      const sessionId = request.headers.get("x-session-id") ?? "";
      deps.store.authorize(sessionId, bearer(request));
      const input = (await readJson(request, 4_500_000)) as SanitizedInput;
      if (!input || input.sessionId !== sessionId)
        throw new HttpError("INVALID_INPUT", 400);
      const context = deps.builder.build(input);
      const lease = deps.store.begin(sessionId);
      const result = await deps.service.analyze(context, lease.signal);
      return json(deps.store.finish(lease, result));
    },
    { parse: "none" },
  );
}
