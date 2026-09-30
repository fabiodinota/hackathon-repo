import { timingSafeEqual } from "node:crypto";
export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}
export class HttpError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
  }
}
export function bearer(request: Request): string {
  return request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
}
export function matchesToken(value: string, expected: string): boolean {
  const a = Buffer.from(value),
    b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
export async function readJson(
  request: Request,
  limit: number,
  signal?: AbortSignal,
  timeoutMs = 10000,
): Promise<unknown> {
  if (
    request.headers.get("content-type")?.split(";")[0].trim() !==
    "application/json"
  )
    throw new HttpError("INVALID_INPUT", 400);
  if (Number(request.headers.get("content-length")) > limit)
    throw new HttpError("PAYLOAD_TOO_LARGE", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError("INVALID_INPUT", 400);
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let failure: HttpError | undefined;
  let rejectRead!: (error: HttpError) => void;
  const stopped = new Promise<never>((_, reject) => {
    rejectRead = reject;
  });
  const stop = (error: HttpError) => {
    if (failure) return;
    failure = error;
    chunks.length = 0;
    rejectRead(error);
    void reader.cancel().catch(() => {});
  };
  const abort = () => stop(new HttpError("STALE_REQUEST", 409));
  const disconnect = () => stop(new HttpError("INVALID_INPUT", 400));
  signal?.addEventListener("abort", abort, { once: true });
  request.signal.addEventListener("abort", disconnect, { once: true });
  const timer = setTimeout(
    () => stop(new HttpError("UPLOAD_TIMEOUT", 408)),
    timeoutMs,
  );
  if (signal?.aborted) abort();
  if (request.signal.aborted) disconnect();
  try {
    while (true) {
      const next = await Promise.race([reader.read(), stopped]);
      if (failure) throw failure;
      if (next.done) break;
      bytes += next.value.length;
      if (bytes > limit) {
        void reader.cancel().catch(() => {});
        throw new HttpError("PAYLOAD_TOO_LARGE", 413);
      }
      chunks.push(next.value);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString());
    } catch {
      throw new HttpError("INVALID_INPUT", 400);
    }
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
    request.signal.removeEventListener("abort", disconnect);
    chunks.length = 0;
    reader.releaseLock();
  }
}
