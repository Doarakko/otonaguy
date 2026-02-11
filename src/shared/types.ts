export interface DetectedCurrency {
  fullMatch: string;
  currencyCode: string;
  rawAmount: string;
  parsedAmount: number;
  startOffset: number;
  endOffset: number;
}

export interface CachedRates {
  base: string;
  date: string;
  fetchedAt: number;
  rates: Record<string, number>;
}

export interface UserPreferences {
  enabled: boolean;
  hidden: boolean;
  targetCurrency: string;
}

export type Message =
  | { type: 'GET_RATES' }
  | { type: 'TOGGLE_HIDE'; value: boolean };

export type RatesResponse = CachedRates | { error: string };
