/**
 * Normalizacja kodów jak w Open Food Facts:
 * kody ≤7 cyfr (po usunięciu wiodących zer) → 8 cyfr, 9–12 cyfr → 13 cyfr.
 * Dzięki temu "034000470693" (UPC-A) i "0034000470693" to ten sam produkt.
 */
export function normalizeBarcode(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  const stripped = digits.replace(/^0+/, '') || '0';
  if (stripped.length <= 7) return stripped.padStart(8, '0');
  if (stripped.length >= 9 && stripped.length <= 12) return stripped.padStart(13, '0');
  return stripped;
}

/** Suma kontrolna GTIN (EAN-8, UPC-A, EAN-13, GTIN-14). */
export function isValidGtin(code: string): boolean {
  if (!/^\d{8}$|^\d{12,14}$/.test(code)) return false;
  const digits = code.split('').map(Number);
  const check = digits.pop()!;
  let sum = 0;
  digits.reverse().forEach((d, i) => {
    sum += d * (i % 2 === 0 ? 3 : 1);
  });
  return (10 - (sum % 10)) % 10 === check;
}

/** Czy kod wygląda na sensowny do wyszukania (6–14 cyfr). */
export function isPlausibleBarcode(code: string): boolean {
  return /^\d{6,14}$/.test(code);
}
