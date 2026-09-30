import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { KbcService } from "./types.js";
import { catalogueTypes, catalogueIntents } from "./vocabulary.js";

export class CatalogueError extends Error {
  constructor(readonly code: "CATALOGUE_UNAVAILABLE" | "CATALOGUE_INVALID") {
    super(code);
  }
}

export function loadCatalogue(
  filePath = fileURLToPath(new URL("../../kbc-services.json", import.meta.url)),
): readonly KbcService[] {
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch {
    throw new CatalogueError("CATALOGUE_UNAVAILABLE");
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new CatalogueError("CATALOGUE_INVALID");
  }
  if (
    !value ||
    typeof value !== "object" ||
    !Array.isArray((value as Record<string, unknown>).services)
  )
    throw new CatalogueError("CATALOGUE_INVALID");
  const ids = new Set<string>();
  const services = (value as { services: unknown[] }).services.map((item) => {
    if (!item || typeof item !== "object") invalid();
    const service = item as Record<string, unknown>;
    const strings = (key: string) =>
      Array.isArray(service[key]) &&
      service[key].length > 0 &&
      service[key].every(
        (entry) => typeof entry === "string" && entry.trim().length > 0,
      );
    if (
      typeof service.id !== "string" ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(service.id) ||
      ids.has(service.id) ||
      typeof service.name !== "string" ||
      !service.name.trim() ||
      typeof service.category !== "string" ||
      !service.category.trim() ||
      typeof service.type !== "string" ||
      !service.type.trim() ||
      !catalogueTypes.has(service.type) ||
      typeof service.path !== "string" ||
      !/^\/[A-Za-z0-9][A-Za-z0-9_./-]*$/.test(service.path) ||
      service.path.includes("..") ||
      service.path.includes("//") ||
      typeof service.requiresAuthentication !== "boolean" ||
      !strings("intents") ||
      !(service.intents as string[]).every((intent) =>
        catalogueIntents.has(intent),
      ) ||
      !Array.isArray(service.keywords) ||
      !service.keywords.every(
        (k) => typeof k === "string" && k.trim().length > 0,
      )
    )
      invalid();
    ids.add(service.id);
    return Object.freeze({
      id: service.id,
      name: service.name,
      category: service.category,
      intents: Object.freeze([...(service.intents as string[])]),
      keywords: Object.freeze([...(service.keywords as string[])]),
      type: service.type,
      path: service.path,
      requiresAuthentication: service.requiresAuthentication,
    });
  });
  return Object.freeze(services);
}

export const loadServiceCatalogue = loadCatalogue;

function invalid(): never {
  throw new CatalogueError("CATALOGUE_INVALID");
}
