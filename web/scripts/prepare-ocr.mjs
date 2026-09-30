import {
  cp,
  mkdir,
  readdir,
  copyFile,
  readFile,
  writeFile,
} from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createHash } from "node:crypto";
const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.join(root, "public/ocr");
await mkdir(path.join(output, "core"), { recursive: true });
await copyFile(
  path.join(root, "node_modules/tesseract.js/dist/worker.min.js"),
  path.join(output, "worker.min.js"),
);
const core = path.join(root, "node_modules/tesseract.js-core");
for (const name of await readdir(core)) {
  if (/^tesseract-core.*\.(wasm|js)$/.test(name))
    await cp(path.join(core, name), path.join(output, "core", name));
}
const model = path.join(output, "eng.traineddata.gz");
const sha256 =
  "ed350f3752f81ee8f38769edc14d92d997dababe23b565c59879372cc46a2468";
let bytes;
try {
  bytes = await readFile(model);
} catch {
  const response = await fetch(
    "https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz",
    { signal: AbortSignal.timeout(60000) },
  );
  if (!response.ok) throw new Error("English OCR model download failed");
  bytes = Buffer.from(await response.arrayBuffer());
}
if (createHash("sha256").update(bytes).digest("hex") !== sha256)
  throw new Error("English OCR model checksum mismatch");
await writeFile(model, bytes);
console.log("Local OCR worker, WASM and English model ready.");
