import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, afterEach } from "vitest";
import { CatalogueError, loadCatalogue } from "../src/catalogue/loader.js";
import { CatalogueMatcher } from "../src/catalogue/matcher.js";
import type { KbcService } from "../src/catalogue/types.js";
import { valid } from "./helpers.js";

const directories: string[] = [];
afterEach(() => {
  for (const dir of directories.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
const cataloguePath = join(process.cwd(), "kbc-services.json");
describe("service catalogue", () => {
  it("loads and freezes the static catalogue", () => {
    const services = loadCatalogue(cataloguePath);
    expect(services.length).toBeGreaterThan(1);
    expect(Object.isFrozen(services)).toBe(true);
    expect(Object.isFrozen(services[0])).toBe(true);
  });
  it.each([
    ["missing", "missing.json"],
    ["malformed", "bad.json"],
    ["duplicate", "duplicate.json"],
    ["missing field", "missing-field.json"],
  ])("rejects %s catalogue", (_label, name) => {
    const directory = mkdtempSync(join(tmpdir(), "kbc-catalogue-"));
    directories.push(directory);
    const value =
      name === "missing.json"
        ? null
        : name === "bad.json"
          ? "{bad"
          : {
              services: [
                {
                  id: "one",
                  name: "One",
                  category: "x",
                  intents: ["x"],
                  keywords: ["x"],
                  type: "guide",
                  path: "/one",
                  requiresAuthentication: false,
                },
                ...(name === "duplicate.json"
                  ? [
                      {
                        id: "one",
                        name: "Two",
                        category: "x",
                        intents: ["x"],
                        keywords: ["x"],
                        type: "guide",
                        path: "/two",
                        requiresAuthentication: false,
                      },
                    ]
                  : [{}]),
              ],
            };
    const path = join(directory, name);
    if (value !== null)
      writeFileSync(
        path,
        typeof value === "string" ? value : JSON.stringify(value),
      );
    expect(() => loadCatalogue(path)).toThrow(CatalogueError);
  });
});

describe("service matcher", () => {
  it("ranks exact intents, limits alternatives and rejects stale/uncertain input", () => {
    const services: KbcService[] = [
      {
        id: "keyword",
        name: "Keyword",
        category: "home",
        intents: ["other"],
        keywords: ["property"],
        type: "guide",
        path: "/keyword",
        requiresAuthentication: false,
      },
      {
        id: "exact",
        name: "Exact",
        category: "home",
        intents: [valid.intent!],
        keywords: [],
        type: "guide",
        path: "/exact",
        requiresAuthentication: false,
      },
      {
        id: "third",
        name: "Third",
        category: "home",
        intents: [valid.intent!],
        keywords: [],
        type: "guide",
        path: "/third",
        requiresAuthentication: false,
      },
      {
        id: "fourth",
        name: "Fourth",
        category: "home",
        intents: [valid.intent!],
        keywords: [],
        type: "guide",
        path: "/fourth",
        requiresAuthentication: false,
      },
    ];
    const matcher = new CatalogueMatcher({
      now: () => Date.parse(valid.generatedAt) + 1,
    });
    const result = matcher.match(valid, services);
    expect(result.recommendation?.serviceId).toBe("exact");
    expect(result.alternatives).toHaveLength(2);
    expect(matcher.match({ ...valid, uncertain: true }, services).matched).toBe(
      false,
    );
    expect(
      matcher.match(
        { ...valid, generatedAt: "2020-01-01T00:00:00.000Z" },
        services,
      ).matched,
    ).toBe(false);
    expect(JSON.stringify(result)).not.toContain(valid.signals.join(" "));
  });
});

it.each(["id", "name", "intents", "path"])(
  "rejects a service missing %s",
  (field) => {
    const dir = mkdtempSync(join(tmpdir(), "kbc-catalogue-"));
    directories.push(dir);
    const entry: Record<string, unknown> = { ...loadCatalogue()[0] };
    delete entry[field];
    const path = join(dir, "catalogue.json");
    writeFileSync(path, JSON.stringify({ services: [entry] }));
    expect(() => loadCatalogue(path)).toThrow("CATALOGUE_INVALID");
  },
);
it.each([
  "https://example.invalid",
  "//example.invalid",
  "/../secret",
  "/%2fsecret",
  "/route?next=elsewhere",
])("rejects unsafe catalogue route %s", (route) => {
  const dir = mkdtempSync(join(tmpdir(), "kbc-catalogue-"));
  directories.push(dir);
  const path = join(dir, "catalogue.json");
  writeFileSync(
    path,
    JSON.stringify({ services: [{ ...loadCatalogue()[0], path: route }] }),
  );
  expect(() => loadCatalogue(path)).toThrow("CATALOGUE_INVALID");
});
it("freezes nested catalogue arrays", () => {
  const services = loadCatalogue();
  expect(Object.isFrozen(services[0].intents)).toBe(true);
  expect(Object.isFrozen(services[0].keywords)).toBe(true);
  expect(() => (services[0].intents as string[]).push("changed")).toThrow();
});
it.each(["Transaction", "transaction ", "unknown"])(
  "rejects noncanonical service type %s",
  (type) => {
    const directory = mkdtempSync(join(tmpdir(), "kbc-catalogue-"));
    directories.push(directory);
    const path = join(directory, "catalogue.json");
    const service = { ...loadCatalogue()[0], type };
    writeFileSync(path, JSON.stringify({ services: [service] }));
    expect(() => loadCatalogue(path)).toThrow("CATALOGUE_INVALID");
  },
);
it("rejects unknown catalogue intents", () => {
  const directory = mkdtempSync(join(tmpdir(), "kbc-catalogue-"));
  directories.push(directory);
  const path = join(directory, "catalogue.json");
  writeFileSync(
    path,
    JSON.stringify({
      services: [{ ...loadCatalogue()[0], intents: ["typo_intent"] }],
    }),
  );
  expect(() => loadCatalogue(path)).toThrow("CATALOGUE_INVALID");
});
