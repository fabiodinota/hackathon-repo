import html2canvas from "html2canvas";
import { LocalOcr } from "../features/ocr/ocr.js";
import {
  buildDocument,
  mapMasks,
  inspectLocally,
} from "../features/privacy/privacy.js";
import {
  startAssistSession,
  mapAssistResponse,
  type AssistSession,
} from "./assistApi";
import { emptySnapshot, type AssistSource } from "./assist";

type Frame = {
  id: string;
  source: "allowlisted_tab";
  timestamp: string;
  safeText: string[];
  imageBase64: string;
  ocrConfidence: number;
};

// Only the explicitly consented mock marketplace is captured, never the banking phone.
export function createLiveAssistSource(): AssistSource {
  let session: AssistSession | null = null;
  let controls: Promise<unknown> = Promise.resolve();
  const request = async (
    path: string,
    method: string,
    body?: unknown,
    signal?: AbortSignal,
  ) => {
    if (!session || Date.parse(session.expiresAt) <= Date.now())
      throw new Error("Session expired");
    const response = await fetch("/api" + path, {
      method,
      cache: "no-store",
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
        : AbortSignal.timeout(15000),
      headers: {
        Authorization: "Bearer " + session.sessionToken,
        "X-Session-Id": session.sessionId,
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) throw new Error("Local service unavailable");
    return response.json();
  };
  const control = (action: "pause" | "delete") => {
    controls = controls
      .catch(() => {})
      .then(async () => {
        if (!session) return;
        await request("/session/pause", "POST");
        if (action === "delete") await request("/context", "DELETE");
      });
    return controls.then(() => {});
  };
  return {
    watch({ signal, onSnapshot, onError }) {
      const ocr = new LocalOcr();
      let timer: number | undefined;
      let frames: Frame[] = [];
      const status = (message: string) => {
        const node = document.querySelector("#pipeline-status");
        if (node && !signal.aborted) node.textContent = message;
      };
      signal.addEventListener(
        "abort",
        () => {
          window.clearTimeout(timer);
          frames = [];
          ocr.dispose();
          status("Paused");
        },
        { once: true },
      );
      const tick = async () => {
        let canvas: HTMLCanvasElement | undefined;
        try {
          if (signal.aborted) return;
          if (document.hidden) {
            timer = window.setTimeout(() => void tick(), 1000);
            return;
          }
          const element = document.querySelector<HTMLElement>(".car-site");
          if (!element) throw new Error("Marketplace unavailable");
          status("Capturing marketplace · processing locally");
          const timestamp = new Date().toISOString();
          canvas = await html2canvas(element, {
            scale: 2,
            logging: false,
            backgroundColor: "#fbf7f1",
            onclone: (doc) => {
              doc.querySelectorAll(".car-specs span").forEach((node) => {
                node.textContent = (node.textContent ?? "").replace(
                  /[⚡◉◷]/g,
                  "",
                );
              });
              doc
                .querySelectorAll(
                  ".car-site img, .car-site svg, .car-site figcaption, .car-rating",
                )
                .forEach((node) => {
                  (node as HTMLElement).style.visibility = "hidden";
                });
              // Known form controls are excluded before rasterization. Names and
              // values must not depend on probabilistic OCR or pattern detection.
              doc
                .querySelectorAll(
                  ".car-site input, .car-site textarea, .car-site select",
                )
                .forEach((node) => {
                  const input = node as HTMLInputElement;
                  input.value = "";
                  input.placeholder = "";
                  input.setAttribute("value", "");
                  input.style.color = "transparent";
                  input.style.background = "#101820";
                });
            },
          });
          if (signal.aborted) return;
          status("Reading text locally");
          const result = await ocr.recognize(canvas, signal);
          if (signal.aborted) return;
          if (result.confidence < 80) {
            status(
              "OCR confidence below cloud threshold: " +
                Math.round(result.confidence),
            );
            throw new Error(
              "Low OCR confidence " + Math.round(result.confidence),
            );
          }
          const doc = buildDocument(result, canvas.width, canvas.height);
          const decision = await inspectLocally(doc.text, signal);
          if (signal.aborted) return;
          const masks = mapMasks(doc, decision, canvas.width, canvas.height);
          const ctx = canvas.getContext("2d")!;
          ctx.fillStyle = "#101820";
          for (const box of masks)
            ctx.fillRect(box.x, box.y, box.width, box.height);
          const excluded = new Set(
            doc.words
              .filter((word: { start: number; end: number; line: number }) =>
                decision.matches.some(
                  (match: { start: number; end: number }) =>
                    word.start < match.end && word.end > match.start,
                ),
              )
              .map((word: { line: number }) => word.line),
          );
          const lines = new Map<number, string[]>();
          for (const word of doc.words)
            if (!excluded.has(word.line))
              lines.set(word.line, [
                ...(lines.get(word.line) ?? []),
                word.text,
              ]);
          const safeText = [...lines.values()].map((words) => words.join(" "));
          if (
            safeText.some((text) =>
              /@|(?:\d[\s.-]?){7,}|(?:password|secret|token)\s*[:=]/i.test(
                text,
              ),
            )
          )
            throw new Error("Unsafe text");
          const resized = document.createElement("canvas");
          const scale = Math.min(1, 1024 / canvas.width, 1024 / canvas.height);
          resized.width = Math.floor(canvas.width * scale);
          resized.height = Math.floor(canvas.height * scale);
          resized
            .getContext("2d")!
            .drawImage(canvas, 0, 0, resized.width, resized.height);
          const imageBase64 = resized.toDataURL("image/png").split(",")[1];
          resized.width = 0;
          resized.height = 0;
          if (imageBase64.length > 1600000) throw new Error("Frame too large");
          frames = [
            ...frames,
            {
              id: crypto.randomUUID(),
              source: "allowlisted_tab" as const,
              timestamp,
              safeText: safeText
                .flatMap((text) => text.match(/.{1,240}/g) ?? [])
                .slice(0, 20),
              imageBase64,
              ocrConfidence: result.confidence / 100,
            },
          ]
            .filter((frame) => Date.parse(frame.timestamp) > Date.now() - 60000)
            .slice(-3);
          while (JSON.stringify(frames).length > 3800000) frames.shift();
          status("Analyzing sanitized marketplace context");
          await request(
            "/intent/analyze",
            "POST",
            { sessionId: session!.sessionId, frames, timeWindowSeconds: 60 },
            signal,
          );
          if (signal.aborted) return;
          const context = await request("/context", "GET", undefined, signal);
          const recommendation = await request(
            "/services/recommendation",
            "GET",
            undefined,
            signal,
          );
          if (signal.aborted) return;
          const snapshot = mapAssistResponse(
            context,
            recommendation,
            session!.sessionId,
          );
          onSnapshot(snapshot);
          status(
            snapshot.suggestion
              ? "Assist active · suggestion ready"
              : "Assist active · no confident intent yet",
          );
          timer = window.setTimeout(() => void tick(), 4000);
        } catch {
          if (!signal.aborted) {
            frames = [];
            onSnapshot(emptySnapshot);
            await control("delete").catch(() => {});
            if (!signal.aborted) {
              status(
                "Processing unavailable · turn Assist off and on to retry",
              );
              onError();
            }
          }
        } finally {
          if (canvas) {
            canvas.width = 0;
            canvas.height = 0;
          }
        }
      };
      void (async () => {
        await controls.catch(() => {});
        if (signal.aborted) return;
        if (!session || Date.parse(session.expiresAt) <= Date.now()) {
          const input =
            document.querySelector<HTMLInputElement>("#pairing-token");
          const token = input?.value.trim() ?? "";
          if (input) input.value = "";
          session = await startAssistSession(token, signal);
        }
        if (signal.aborted) return;
        await request("/session/resume", "POST", undefined, signal);
        if (!signal.aborted) void tick();
      })().catch(() => {
        if (!signal.aborted) {
          status("Connection failed · enter the local pairing token and retry");
          onError();
        }
      });
    },
    pause: () => control("pause"),
    deleteContext: () => control("delete"),
  };
}
export const liveAssistSource = createLiveAssistSource();
