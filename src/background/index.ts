import { getExchangeRates } from './rateService';
import { DEFAULT_PREFERENCES, RATE_BASE_CURRENCY } from '../shared/constants';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_RATES') {
    getExchangeRates(RATE_BASE_CURRENCY)
      .then((data) => sendResponse(data))
      .catch((err) => sendResponse({ error: (err as Error).message }));
    return true;
  }
  return false;
});

chrome.runtime.onInstalled.addListener(async () => {
  // Set defaults only for missing preferences (don't overwrite user settings)
  const existing = await chrome.storage.local.get(Object.keys(DEFAULT_PREFERENCES));
  const missing: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(DEFAULT_PREFERENCES)) {
    if (existing[key] === undefined) {
      missing[key] = value;
    }
  }
  if (Object.keys(missing).length > 0) {
    await chrome.storage.local.set(missing);
  }
  // Clean up old keys from previous versions
  chrome.storage.local.remove(['sourceCurrency']);
});

// Pre-fetch rates on service worker startup so cache is warm for content scripts
getExchangeRates(RATE_BASE_CURRENCY).catch(() => {});
