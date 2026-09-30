import { inflateSync } from "node:zlib";

// Restricted Canvas profile: 8-bit RGB/RGBA, non-interlaced PNG.
// Representation validation does not establish that pixels are redacted.
export function validSanitizedPng(
  value: unknown,
  maxBytes: number,
): value is string {
  if (
    typeof value !== "string" ||
    value.length > Math.ceil(maxBytes / 3) * 4 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value,
    )
  )
    return false;
  const bytes = Buffer.from(value, "base64");
  if (
    bytes.length > maxBytes ||
    bytes.length < 57 ||
    bytes.toString("base64") !== value ||
    !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return false;
  let offset = 8,
    width = 0,
    height = 0,
    channels = 0,
    pixelsStarted = false;
  const seen = new Set<string>();
  const pixels: Buffer[] = [];
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const end = offset + length + 12;
    if (end > bytes.length) return false;
    const type = bytes.toString("latin1", offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, end - 4);
    if (
      crc32(bytes.subarray(offset + 4, end - 4)) !== bytes.readUInt32BE(end - 4)
    )
      return false;
    if (offset === 8 && type !== "IHDR") return false;
    if (type !== "IDAT" && seen.has(type)) return false;
    switch (type) {
      case "IHDR":
        if (offset !== 8 || length !== 13) return false;
        width = data.readUInt32BE(0);
        height = data.readUInt32BE(4);
        if (
          width < 1 ||
          height < 1 ||
          width > 1024 ||
          height > 1024 ||
          data[8] !== 8 ||
          ![2, 6].includes(data[9]) ||
          data[10] !== 0 ||
          data[11] !== 0 ||
          data[12] !== 0
        )
          return false;
        channels = data[9] === 2 ? 3 : 4;
        break;
      case "sRGB":
        if (pixelsStarted || length !== 1 || data[0] > 3) return false;
        break;
      case "gAMA":
        if (pixelsStarted || length !== 4 || data.readUInt32BE(0) === 0)
          return false;
        break;
      case "cHRM":
        if (pixelsStarted || length !== 32) return false;
        break;
      case "IDAT":
        pixelsStarted = true;
        pixels.push(data);
        break;
      case "IEND": {
        if (length !== 0 || end !== bytes.length || !pixelsStarted)
          return false;
        const stride = width * channels + 1;
        const expected = stride * height;
        try {
          const compressed = Buffer.concat(pixels);
          const inflated = inflateSync(compressed, {
            maxOutputLength: expected,
            info: true,
          }) as unknown as { buffer: Buffer; engine: { bytesWritten: number } };
          if (
            inflated.buffer.length !== expected ||
            inflated.engine.bytesWritten !== compressed.length
          )
            return false;
          for (let row = 0; row < height; row++)
            if (inflated.buffer[row * stride] > 4) return false;
          return true;
        } catch {
          return false;
        }
      }
      default:
        return false; // No text, EXIF, palettes, or unknown ancillary payloads.
    }
    seen.add(type);
    offset = end;
  }
  return false;
}
const crcTable = Array.from({ length: 256 }, (_, i) => {
  for (let bit = 0; bit < 8; bit++) i = (i >>> 1) ^ (i & 1 ? 0xedb88320 : 0);
  return i >>> 0;
});
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
  return (crc ^ 0xffffffff) >>> 0;
}
