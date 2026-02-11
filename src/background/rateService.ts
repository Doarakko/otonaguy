import { CACHE_DURATION_MS, FRANKFURTER_API_BASE } from '../shared/constants';
import type { CachedRates } from '../shared/types';

export async function getExchangeRates(baseCurrency: string): Promise<CachedRates> {
  // Check cache first
  const cached = await chrome.storage.local.get('exchangeRates');
  const data = cached.exchangeRates as CachedRates | undefined;

  if (
    data &&
    data.base === baseCurrency &&
    Date.now() - data.fetchedAt < CACHE_DURATION_MS
  ) {
    return data;
  }

  // Fetch fresh rates
  try {
    const resp = await fetch(
      `${FRANKFURTER_API_BASE}/latest?from=${baseCurrency}`
    );
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = await resp.json();

    const rates: CachedRates = {
      base: baseCurrency,
      date: json.date,
      fetchedAt: Date.now(),
      rates: { ...json.rates, [baseCurrency]: 1 },
    };

    await chrome.storage.local.set({ exchangeRates: rates });
    return rates;
  } catch (err) {
    // Fallback to stale cache if available
    if (data) return data;
    throw err;
  }
}
