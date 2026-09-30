import { expect, it } from "vitest";
import { loadConfig } from "../src/config/env.js";

it("defaults to loopback and allows an explicit container bind", () => {
  expect(loadConfig({}).host).toBe("127.0.0.1");
  expect(loadConfig({ HOST: "0.0.0.0" }).host).toBe("0.0.0.0");
  expect(() => loadConfig({ HOST: "192.168.1.2" })).toThrow();
});

it("retains local origin and pairing-token restrictions in container mode", () => {
  expect(() =>
    loadConfig({
      HOST: "0.0.0.0",
      ALLOWED_ORIGINS: "https://external.example",
    }),
  ).toThrow();
  expect(() =>
    loadConfig({ HOST: "0.0.0.0", SESSION_TOKEN: "short" }),
  ).toThrow();
});
