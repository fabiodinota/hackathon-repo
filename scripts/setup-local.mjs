import { readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
const root = new URL("../", import.meta.url);
const template = await readFile(new URL(".env.example", root), "utf8");
const content = template.replace(
  /^SESSION_TOKEN=.*$/m,
  "SESSION_TOKEN=" + randomBytes(32).toString("hex"),
);
try {
  await writeFile(new URL(".env", root), content, { flag: "wx", mode: 0o600 });
  console.log("Created private .env with a local pairing token.");
} catch (error) {
  if (error.code !== "EEXIST") throw error;
  console.log("Existing .env preserved.");
}
