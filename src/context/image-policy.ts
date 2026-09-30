// Only already-masked, downscaled PNGs from the upstream Canvas export are accepted.
// This checks representation/size, not whether pixels contain personal information.
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
    bytes.length < 45 ||
    bytes.toString("base64") !== value
  )
    return false;
  if (
    !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return false;
  if (
    bytes.readUInt32BE(8) !== 13 ||
    bytes.toString("ascii", 12, 16) !== "IHDR"
  )
    return false;
  const width = bytes.readUInt32BE(16),
    height = bytes.readUInt32BE(20);
  if (width < 1 || height < 1 || width > 1024 || height > 1024) return false;
  let offset = 8,
    hasPixels = false;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset),
      type = bytes.toString("ascii", offset + 4, offset + 8);
    // Exclude text, EXIF and other metadata chunks which could carry private values.
    if (
      ![
        "IHDR",
        "IDAT",
        "IEND",
        "sRGB",
        "gAMA",
        "cHRM",
        "PLTE",
        "tRNS",
      ].includes(type) ||
      offset + length + 12 > bytes.length
    )
      return false;
    if (type === "IDAT" && length > 0) hasPixels = true;
    offset += length + 12;
    if (type === "IEND")
      return length === 0 && offset === bytes.length && hasPixels;
  }
  return false;
}
