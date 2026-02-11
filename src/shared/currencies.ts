export const SYMBOL_TO_CURRENCY: Record<string, string> = {
  '$': 'USD',
  '€': 'EUR',
  '£': 'GBP',
  '¥': 'JPY',
  '￥': 'JPY',
  '₹': 'INR',
  '₩': 'KRW',
  'R$': 'BRL',
  '円': 'JPY',
  '元': 'CNY',
  'kr': 'SEK',
  'Fr': 'CHF',
  'zł': 'PLN',
  'Kč': 'CZK',
  'Ft': 'HUF',
};

export const CURRENCY_NAMES: Record<string, string> = {
  USD: 'US Dollar',
  EUR: 'Euro',
  GBP: 'British Pound',
  JPY: 'Japanese Yen',
  CNY: 'Chinese Yuan',
  AUD: 'Australian Dollar',
  CAD: 'Canadian Dollar',
  CHF: 'Swiss Franc',
  HKD: 'Hong Kong Dollar',
  SGD: 'Singapore Dollar',
  SEK: 'Swedish Krona',
  NOK: 'Norwegian Krone',
  DKK: 'Danish Krone',
  NZD: 'New Zealand Dollar',
  MXN: 'Mexican Peso',
  BRL: 'Brazilian Real',
  INR: 'Indian Rupee',
  KRW: 'South Korean Won',
  THB: 'Thai Baht',
  IDR: 'Indonesian Rupiah',
  MYR: 'Malaysian Ringgit',
  PHP: 'Philippine Peso',
  PLN: 'Polish Zloty',
  CZK: 'Czech Koruna',
  HUF: 'Hungarian Forint',
  RON: 'Romanian Leu',
  TRY: 'Turkish Lira',
  ZAR: 'South African Rand',
  ILS: 'Israeli Shekel',
  ISK: 'Icelandic Krona',
  BGN: 'Bulgarian Lev',
};

export const SUPPORTED_CURRENCIES = Object.keys(CURRENCY_NAMES);

export const CURRENCY_CODES_PATTERN = SUPPORTED_CURRENCIES.join('|');

// Currencies with 0 decimal digits
export const ZERO_DECIMAL_CURRENCIES = new Set(['JPY', 'KRW', 'ISK', 'HUF']);
