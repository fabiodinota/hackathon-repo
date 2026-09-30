import { afterEach, expect, it, vi } from "vitest";
import { deflateSync } from "node:zlib";
import { validSanitizedPng } from "../src/context/image-policy.js";
import { png } from "./helpers.js";

function chunk(type: string, data = Buffer.alloc(0)) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length);
  out.write(type, 4);
  data.copy(out, 8);
  let crc = 0xffffffff;
  for (const byte of out.subarray(4, -4)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  out.writeUInt32BE((crc ^ 0xffffffff) >>> 0, out.length - 4);
  return out;
}
const original = Buffer.from(png, "base64");
const header = original.subarray(8, 33);
const pixels = original.subarray(33, -12);
const end = chunk("IEND");
function image(...parts: Buffer[]) {
  return Buffer.concat([original.subarray(0, 8), ...parts]).toString("base64");
}
afterEach(() => vi.useRealTimers());
it("accepts RGB and RGBA Canvas PNGs and standard fixed-length color chunks", () => {
  expect(validSanitizedPng(png, 1200000)).toBe(true);
  const rgba = Buffer.from(original.subarray(16, 29));
  rgba[9] = 6;
  expect(
    validSanitizedPng(
      image(
        chunk("IHDR", rgba),
        chunk("sRGB", Buffer.from([0])),
        chunk("IDAT", deflateSync(Buffer.from([0, 0, 0, 0, 255]))),
        end,
      ),
      1200000,
    ),
  ).toBe(true);
  const gamma = Buffer.alloc(4);
  gamma.writeUInt32BE(45455);
  expect(
    validSanitizedPng(
      image(header, chunk("gAMA", gamma), pixels, end),
      1200000,
    ),
  ).toBe(true);
});
it("rejects metadata smuggled into known chunks, unknown chunks and invalid ordering", () => {
  for (const value of [
    image(
      header,
      chunk("gAMA", Buffer.from("synthetic-private-metadata")),
      pixels,
      end,
    ),
    image(
      header,
      chunk("tEXt", Buffer.from("synthetic-private-metadata")),
      pixels,
      end,
    ),
    image(header, header, pixels, end),
    image(header, pixels, chunk("sRGB", Buffer.from([0])), end),
    image(
      header,
      chunk("sRGB", Buffer.from([0])),
      chunk("sRGB", Buffer.from([0])),
      pixels,
      end,
    ),
    image(header, end),
    image(pixels, header, end),
    image(header, pixels, end, Buffer.from([1])),
  ])
    expect(validSanitizedPng(value, 1200000)).toBe(false);
});
it("rejects corrupt pixels, invalid filters, trailing compressed data and decompression overflow", () => {
  for (const data of [
    Buffer.from("invalid"),
    deflateSync(Buffer.from([5, 0, 0, 0])),
    deflateSync(Buffer.alloc(5)),
    Buffer.concat([deflateSync(Buffer.alloc(4)), Buffer.from("extra")]),
  ])
    expect(
      validSanitizedPng(image(header, chunk("IDAT", data), end), 1200000),
    ).toBe(false);
  const bad = Buffer.from(original);
  bad[29] ^= 255;
  expect(validSanitizedPng(bad.toString("base64"), 1200000)).toBe(false);
  const length = Buffer.from(original);
  length.writeUInt32BE(0xffffffff, 33);
  expect(validSanitizedPng(length.toString("base64"), 1200000)).toBe(false);
});
it("rejects unsupported PNG profiles and overlarge dimensions", () => {
  for (const mutate of [
    (data: Buffer) => data.writeUInt32BE(1025),
    (data: Buffer) => (data[8] = 16),
    (data: Buffer) => (data[9] = 3),
    (data: Buffer) => (data[12] = 1),
  ]) {
    const data = Buffer.from(original.subarray(16, 29));
    mutate(data);
    expect(
      validSanitizedPng(image(chunk("IHDR", data), pixels, end), 1200000),
    ).toBe(false);
  }
  expect(validSanitizedPng("data:image/png;base64," + png, 1200000)).toBe(
    false,
  );
});
