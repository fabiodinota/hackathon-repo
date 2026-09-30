// Screenshot and OCR share a single layout; all values are synthetic.
const lines = [
  ["DRIVELY / DEMO MARKETPLACE", null],
  ["Looking for an electric car", null],
  ["Compare models, range and monthly price", null],
  ["Email: alex@example.test", "EMAIL"],
  ["Phone: +44 20 1234 5678", "PHONE"],
  ["IBAN: BE68 5390 0754 7034", "IBAN"],
  ["Card: 4111 1111 1111 1111", "CREDIT_CARD"],
  ["Password: synthetic-demo-secret", "CREDENTIAL"],
];
export function createFixture() {
  const canvas = document.createElement("canvas");
  canvas.width = 960;
  canvas.height = 520;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#f7faf9";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = "20px monospace";
  ctx.textBaseline = "top";
  const words = [];
  const matches = [];
  let byteOffset = 0;
  const encoder = new TextEncoder();
  for (const [line, [text, category]] of lines.entries()) {
    const y = 34 + line * 58;
    ctx.fillStyle = line < 3 ? "#176753" : "#233c48";
    ctx.fillText(text, 32, y);
    let x = 32;
    const start = byteOffset;
    for (const [index, value] of text.split(" ").entries()) {
      if (index) x += ctx.measureText(" ").width;
      const width = ctx.measureText(value).width;
      words.push({
        text: value,
        confidence: 99,
        line,
        box: {
          x: Math.floor(x),
          y: y - 2,
          width: Math.ceil(width) + 1,
          height: 28,
        },
      });
      x += width;
    }
    if (category)
      matches.push({
        category,
        start:
          start + encoder.encode(text.slice(0, text.indexOf(" ") + 1)).length,
        end: start + encoder.encode(text).length,
      });
    byteOffset += encoder.encode(text).length + 1;
  }
  return {
    canvas,
    ocr: { confidence: 99, words },
    decision: { status: "ok", matches },
  };
}
