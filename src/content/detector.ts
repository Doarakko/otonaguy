import { SYMBOL_TO_CURRENCY, CURRENCY_CODES_PATTERN, ZERO_DECIMAL_CURRENCIES } from '../shared/currencies';
import type { DetectedCurrency } from '../shared/types';

// Number pattern: digits (any length) with optional thousands separators and decimal part
const NUM = String.raw`\d+(?:[,.\s]\d{3})*(?:[.,]\d{1,2})?`;

// Build regex for ISO currency codes
const CODES = CURRENCY_CODES_PATTERN;

interface PatternDef {
  regex: RegExp;
  currencyGroup: number;
  amountGroup: number;
  type: 'symbol' | 'code';
}

const PATTERNS: PatternDef[] = [
  // 1. ISO code prefix: "USD 1,000.00" or "USD1,000"
  {
    regex: new RegExp(`\\b(${CODES})\\s?(${NUM})\\b`, 'g'),
    currencyGroup: 1,
    amountGroup: 2,
    type: 'code',
  },
  // 2. ISO code suffix: "1,000.00 USD"
  {
    regex: new RegExp(`\\b(${NUM})\\s?(${CODES})\\b`, 'g'),
    currencyGroup: 2,
    amountGroup: 1,
    type: 'code',
  },
  // 3. Multi-char symbol prefix: "R$100"
  {
    regex: new RegExp(`(R\\$)\\s?(${NUM})`, 'g'),
    currencyGroup: 1,
    amountGroup: 2,
    type: 'symbol',
  },
  // 4. Single-char symbol prefix: "$100", "€50", "£30", "¥10,000"
  {
    regex: new RegExp(`([$€£¥￥₹₩])\\s?(${NUM})`, 'g'),
    currencyGroup: 1,
    amountGroup: 2,
    type: 'symbol',
  },
  // 5. Suffix symbols: "1000円", "500元"
  //    Use (?!\w) instead of \b because 円/元/Kč/zł are non-ASCII and \b fails after them
  {
    regex: new RegExp(`(${NUM})\\s?(円|元|kr|Kč|Ft|zł|Fr)(?!\\w)`, 'g'),
    currencyGroup: 2,
    amountGroup: 1,
    type: 'symbol',
  },
];

export function detectCurrencies(text: string): DetectedCurrency[] {
  const results: DetectedCurrency[] = [];
  const usedRanges: Array<[number, number]> = [];

  for (const pattern of PATTERNS) {
    pattern.regex.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.regex.exec(text)) !== null) {
      const startOffset = match.index;
      const endOffset = startOffset + match[0].length;

      // Skip if this range overlaps with a previous detection
      if (usedRanges.some(([s, e]) => startOffset < e && endOffset > s)) {
        continue;
      }

      // Check for false positives
      if (isLikelyFalsePositive(text, startOffset, endOffset)) {
        continue;
      }

      const currencyIndicator = match[pattern.currencyGroup];
      const rawAmount = match[pattern.amountGroup];

      const currencyCode =
        pattern.type === 'code'
          ? currencyIndicator
          : SYMBOL_TO_CURRENCY[currencyIndicator];

      if (!currencyCode) continue;

      const parsedAmount = parseAmount(rawAmount, currencyCode);
      if (isNaN(parsedAmount) || parsedAmount <= 0) continue;

      results.push({
        fullMatch: match[0],
        currencyCode,
        rawAmount,
        parsedAmount,
        startOffset,
        endOffset,
      });

      usedRanges.push([startOffset, endOffset]);
    }
  }

  // Sort by start offset
  results.sort((a, b) => a.startOffset - b.startOffset);
  return results;
}

function parseAmount(raw: string, currencyCode: string): number {
  let cleaned = raw.replace(/\s/g, '');
  const isZeroDecimal = ZERO_DECIMAL_CURRENCIES.has(currencyCode);

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');

  if (lastComma !== -1 && lastDot !== -1) {
    // Both comma and dot present
    if (lastComma > lastDot) {
      // European: 1.000,50
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      // US/UK: 1,000.50
      cleaned = cleaned.replace(/,/g, '');
    }
  } else if (lastComma !== -1) {
    // Only commas, no dots
    if (isZeroDecimal) {
      // Zero-decimal currencies (JPY, KRW, etc): comma is always thousands separator
      cleaned = cleaned.replace(/,/g, '');
    } else {
      const afterComma = cleaned.length - lastComma - 1;
      if (afterComma === 3) {
        cleaned = cleaned.replace(/,/g, '');
      } else {
        cleaned = cleaned.replace(',', '.');
      }
    }
  } else if (lastDot !== -1) {
    // Only dots, no commas
    const afterDot = cleaned.length - lastDot - 1;
    if (afterDot === 3 && isZeroDecimal) {
      cleaned = cleaned.replace(/\./g, '');
    }
    // Otherwise keep dot as decimal
  }

  return parseFloat(cleaned);
}

function isLikelyFalsePositive(
  text: string,
  start: number,
  end: number,
): boolean {
  // Check surrounding context (50 chars before and after)
  const contextStart = Math.max(0, start - 20);
  const contextEnd = Math.min(text.length, end + 20);
  const context = text.slice(contextStart, contextEnd);

  // Version numbers: v1.0.0, 2.3.1
  if (/v?\d+\.\d+\.\d+/.test(context)) return true;

  // CSS units
  if (/\d+(?:px|em|rem|vh|vw|pt|cm|mm|%)\b/.test(context)) return true;

  // Date-like patterns adjacent to the match
  const before = text.slice(Math.max(0, start - 5), start);
  const after = text.slice(end, Math.min(text.length, end + 5));
  if (/\d[\/\-]$/.test(before) || /^[\/\-]\d/.test(after)) return true;

  return false;
}
