import { describe, expect, it } from 'vitest';
import { isValidGtin, normalizeBarcode } from '../../src/lib/barcode';

describe('kody kreskowe', () => {
  it('normalizuje jak Open Food Facts', () => {
    expect(normalizeBarcode('034000470693')).toBe('0034000470693');
    expect(normalizeBarcode('0034000470693')).toBe('0034000470693');
    expect(normalizeBarcode('5901234123457')).toBe('5901234123457');
    expect(normalizeBarcode('00012345')).toBe('00012345');
    expect(normalizeBarcode('12345')).toBe('00012345');
    expect(normalizeBarcode(' 590-1234-123457 ')).toBe('5901234123457');
  });
  it('sprawdza sumę kontrolną', () => {
    expect(isValidGtin('5901234123457')).toBe(true);
    expect(isValidGtin('5901234123458')).toBe(false);
    expect(isValidGtin('96385074')).toBe(true); // EAN-8
    expect(isValidGtin('036000291452')).toBe(true); // UPC-A
    expect(isValidGtin('123')).toBe(false);
  });
});
