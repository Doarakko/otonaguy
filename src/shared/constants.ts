export const CACHE_DURATION_MS = 4 * 60 * 60 * 1000; // 4 hours

export const FRANKFURTER_API_BASE = 'https://api.frankfurter.app';

// Fixed base currency for rate fetching (arbitrary - we cross-compute all rates)
export const RATE_BASE_CURRENCY = 'EUR';

export const SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'SELECT',
  'CODE', 'PRE', 'KBD', 'SAMP', 'SVG', 'MATH',
  'NOSCRIPT', 'TEMPLATE',
]);

export const DEFAULT_PREFERENCES = {
  enabled: true,
  hidden: false,
  hideOriginal: true,
  targetCurrency: 'USD',
  randomCurrency: true,
};

// Quick pre-filter regex to check if text might contain a currency
export const QUICK_CURRENCY_TEST =
  /[$€£¥￥₹₩円元]|(?:USD|EUR|GBP|JPY|CNY|AUD|CAD|CHF)\s?\d|R\$|\d\s?(?:kr|Kč|Ft|zł|Fr|円|元)/;
