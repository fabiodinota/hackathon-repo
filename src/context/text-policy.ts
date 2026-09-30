// Boundary checks only: Interdict remains the PII detector/redactor.
// These conservative checks do NOT establish that arbitrary text is PII-free.
export function violatesTextPolicy(text: string): boolean {
  const compact = text.replace(/[\s-]/g, "");
  return (
    /@/.test(text) ||
    /[A-Z]{2}\d{2}[A-Z0-9]{11,30}/i.test(compact) ||
    /(?:\d[\s.-]?){7,}/.test(text) ||
    /(?:password|passwd|secret|api[_ -]?key|token|authorization)\s*[:=]/i.test(
      text,
    ) ||
    /-----BEGIN|\bBearer\s+/i.test(text) ||
    /[\u0000-\u001f\u007f]/.test(text)
  );
}
