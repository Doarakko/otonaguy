import './styles.css';
import { detectCurrencies } from './detector';
import { annotateNode, annotateElement, removeAllAnnotations } from './converter';
import { findTextNodesWithCurrency, findPriceElements, findSplitCurrencyElements } from './dom-walker';
import { SYMBOL_TO_CURRENCY, SUPPORTED_CURRENCIES } from '../shared/currencies';
import { CACHE_DURATION_MS, RATE_BASE_CURRENCY } from '../shared/constants';
import type { CachedRates } from '../shared/types';

let observer: MutationObserver | null = null;
let isEnabled = true;
let isHidden = false;
let hideOriginal = false;
let targetCurrency = 'USD';
let randomCurrency = true;
let rates: Record<string, number> = {};
let ratesReady = false;
let autoFallbackAttempted = false;

// Start loading data IMMEDIATELY at document_start (parallel with DOM parsing)
const dataPromise = chrome.storage.local.get([
  'enabled',
  'hidden',
  'hideOriginal',
  'targetCurrency',
  'randomCurrency',
  'exchangeRates',
]);

function processNode(root: Node): void {
  if (!ratesReady) return;

  // Strategy 1: Direct text node detection
  const textNodes = findTextNodesWithCurrency(root);
  let converted = 0;
  for (const node of textNodes) {
    const detections = detectCurrencies(node.textContent!);
    // Process only the last valid detection; annotateNode replaces the text node,
    // so remaining matches in the before/after text will be caught by MutationObserver
    for (let i = detections.length - 1; i >= 0; i--) {
      const detection = detections[i];
      const rate = computeRate(detection.currencyCode, targetCurrency);
      if (rate !== null) {
        annotateNode(node, detection, targetCurrency, rate);
        converted++;
        break;
      }
    }
  }

  // Strategy 2: Price element detection (handles split nodes)
  // Reverse to process innermost elements first; querySelector then skips outer ancestors
  const priceElements = findPriceElements(root).reverse();
  for (const el of priceElements) {
    if (el.querySelector('[data-currency-converted]')) continue;
    if (el.hasAttribute('data-currency-converted')) continue;
    if (el.closest('[data-currency-converted]')) continue;

    const text = (el.innerText || el.textContent || '').trim();
    const detections = detectCurrencies(text);
    if (detections.length > 0) {
      const detection = detections[0];
      const rate = computeRate(detection.currencyCode, targetCurrency);
      if (rate !== null) {
        annotateElement(el, detection.parsedAmount, detection.currencyCode, targetCurrency, rate);
        converted++;
      }
    } else {
      const priceAttr = el.getAttribute('data-price') || el.getAttribute('content');
      if (priceAttr) {
        const amount = parseFloat(priceAttr);
        if (!isNaN(amount) && amount > 0) {
          const currencyCode = guessCurrencyFromText(text);
          if (currencyCode) {
            const rate = computeRate(currencyCode, targetCurrency);
            if (rate !== null) {
              annotateElement(el, amount, currencyCode, targetCurrency, rate);
              converted++;
            }
          }
        }
      }
    }
  }

  // Strategy 3: Split currency nodes (symbol and number in separate elements)
  const splitElements = findSplitCurrencyElements(root);
  for (const el of splitElements) {
    if (el.querySelector('[data-currency-converted]')) continue;
    if (el.hasAttribute('data-currency-converted')) continue;
    if (el.closest('[data-currency-converted]')) continue;

    const text = (el.innerText || el.textContent || '').trim();
    const detections = detectCurrencies(text);
    if (detections.length > 0) {
      const detection = detections[0];
      const rate = computeRate(detection.currencyCode, targetCurrency);
      if (rate !== null) {
        annotateElement(el, detection.parsedAmount, detection.currencyCode, targetCurrency, rate);
        converted++;
      }
    }
  }

  // Hide point-related elements (irrelevant for foreign currency)
  hidePointElements(root);

  if (root === document.body) {
    console.log(`[otonaguy] processNode: target=${targetCurrency}, textNodes=${textNodes.length}, priceEls=${priceElements.length}, splitEls=${splitElements.length}, converted=${converted}, rateKeys=${Object.keys(rates).length}`);

    // Auto-fallback: if prices were found but none converted, targetCurrency likely matches page currency
    if (converted === 0 && (textNodes.length > 0 || priceElements.length > 0) && !autoFallbackAttempted) {
      autoFallbackAttempted = true;
      const fallback = targetCurrency === 'USD' ? 'EUR' : 'USD';
      console.log(`[otonaguy] 0 conversions — target=${targetCurrency} likely matches page currency. Retrying with ${fallback}`);
      targetCurrency = fallback;
      processNode(document.body);
    }
  }
}

function guessCurrencyFromText(text: string): string | null {
  for (const [symbol, code] of Object.entries(SYMBOL_TO_CURRENCY)) {
    if (text.includes(symbol)) return code;
  }
  return null;
}

const POINT_KEYWORDS = /ポイント|獲得|エントリー|\dpt[\s(]|\dpt$/;

// CSS selectors for point/loyalty elements (Amazon etc.)
const POINT_SELECTORS = [
  '#loyalty-points-offer',
  '[class*="loyaltyPoints"]',
  '[class*="LoyaltyPoints"]',
  '[class*="loyalty-points"]',
  '[id*="loyaltyPoints"]',
  '[id*="loyalty-points"]',
].join(',');

function hidePointElements(root: Node): void {
  if (!(root instanceof HTMLElement)) return;

  const toHide = new Set<HTMLElement>();

  // Approach 1: Text-based detection (works across all sites)
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const text = (walker.currentNode.textContent || '').trim();
    if (!POINT_KEYWORDS.test(text)) continue;

    let el = walker.currentNode.parentElement;
    if (!el) continue;

    // Climb to find a reasonable container
    for (let i = 0; i < 3 && el.parentElement; i++) {
      const parentLen = (el.parentElement.innerText || '').trim().length;
      if (parentLen > 80) break;
      el = el.parentElement;
    }

    // Only hide small-ish elements (point badges, not long descriptions)
    const elText = (el.innerText || '').trim();
    if (elText.length <= 80 && !el.hasAttribute('data-otonaguy-point-hidden')) {
      toHide.add(el);
    }
  }

  // Approach 2: CSS selector-based detection (Amazon loyalty elements)
  try {
    const selectorEls = root.querySelectorAll
      ? root.querySelectorAll(POINT_SELECTORS)
      : [];
    for (const el of selectorEls) {
      if (el instanceof HTMLElement && !el.hasAttribute('data-otonaguy-point-hidden')) {
        toHide.add(el);
      }
    }
    // Also check root itself
    if (root instanceof HTMLElement && root.matches && root.matches(POINT_SELECTORS)) {
      if (!root.hasAttribute('data-otonaguy-point-hidden')) {
        toHide.add(root);
      }
    }
  } catch {
    // querySelectorAll might fail on certain nodes
  }

  for (const el of toHide) {
    el.setAttribute('data-otonaguy-point-hidden', 'true');
    el.style.display = 'none';
  }
}

function showPointElements(): void {
  const hidden = document.querySelectorAll('[data-otonaguy-point-hidden]');
  for (const el of hidden) {
    el.removeAttribute('data-otonaguy-point-hidden');
    (el as HTMLElement).style.display = '';
  }
}

function computeRate(fromCode: string, toCode: string): number | null {
  if (fromCode === toCode) return null;
  const fromRate = rates[fromCode];
  const toRate = rates[toCode];
  if (!fromRate || !toRate) return null;
  return toRate / fromRate;
}

function applyBodyAttributes(): void {
  if (!document.body) return;
  if (isHidden) {
    document.body.setAttribute('data-otonaguy-hidden', 'true');
  } else {
    document.body.removeAttribute('data-otonaguy-hidden');
  }
  if (hideOriginal) {
    document.body.setAttribute('data-otonaguy-hide-original', 'true');
  } else {
    document.body.removeAttribute('data-otonaguy-hide-original');
  }
}

function startObserving(): void {
  if (observer) {
    observer.disconnect();
  }
  observer = new MutationObserver((mutations) => {
    if (!ratesReady) return;
    const addedNodes = new Set<Node>();
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        for (const node of mutation.addedNodes) {
          if (
            node instanceof HTMLElement &&
            node.hasAttribute('data-currency-converted')
          ) {
            continue;
          }
          addedNodes.add(node);
        }
      }
      if (mutation.type === 'characterData' && mutation.target.parentNode) {
        addedNodes.add(mutation.target.parentNode);
      }
    }
    if (addedNodes.size > 0) {
      console.log(`[otonaguy] observer: ${addedNodes.size} nodes added`);
    }
    for (const node of addedNodes) {
      processNode(node);
    }
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}

/** Request background to fetch fresh rates and re-process DOM */
async function refreshRatesFromBackground(): Promise<void> {
  try {
    const rateData = await chrome.runtime.sendMessage({
      type: 'GET_RATES',
    }) as CachedRates | { error: string } | undefined;

    if (!rateData || 'error' in rateData) return;

    rates = rateData.rates;
    if (document.body) {
      removeAllAnnotations();
      showPointElements();
      processNode(document.body);
    }
  } catch {
    // Background unavailable, keep using cached rates
  }
}

function processAndObserve(): void {
  applyBodyAttributes();
  processNode(document.body);
  // Observer is already running from document_start
}

async function initialize(): Promise<void> {
  const t0 = performance.now();

  // Clean up any stale annotations
  if (document.body) {
    removeAllAnnotations();
  }

  const data = await dataPromise;

  isEnabled = data.enabled !== false;
  isHidden = data.hidden === true;
  hideOriginal = data.hideOriginal !== false;
  randomCurrency = data.randomCurrency !== false;
  targetCurrency = data.targetCurrency || 'USD';

  // Pick a random currency for this page load
  if (randomCurrency) {
    const candidates = SUPPORTED_CURRENCIES.filter((c) => c !== 'JPY');
    targetCurrency = candidates[Math.floor(Math.random() * candidates.length)];
  }

  console.log(`[otonaguy] init: enabled=${isEnabled}, random=${randomCurrency}, target=${targetCurrency}`);

  if (!isEnabled) return;

  // Try cached rates first (no service worker round-trip)
  const cached = data.exchangeRates as CachedRates | undefined;
  console.log(`[otonaguy] cache: exists=${!!cached}, hasRates=${!!(cached && cached.rates)}, base=${cached?.base}`);
  if (cached && cached.rates && cached.base === RATE_BASE_CURRENCY) {
    rates = cached.rates;
    ratesReady = true;

    // Body might exist already (storage read ~5ms, DOM parsing runs in parallel)
    if (document.body) {
      processAndObserve();
      console.log(`[otonaguy] Ready in ${(performance.now() - t0).toFixed(0)}ms (cached)`);
    }
    // If body doesn't exist yet, the MutationObserver handles it via onBodyReady below

    // Refresh expired cache in background (don't block display)
    if (Date.now() - cached.fetchedAt > CACHE_DURATION_MS) {
      refreshRatesFromBackground();
    }
  } else {
    // No cache, must fetch from background
    try {
      const rateData = await chrome.runtime.sendMessage({
        type: 'GET_RATES',
      }) as CachedRates | { error: string } | undefined;

      if (!rateData || 'error' in rateData) return;
      rates = rateData.rates;
      ratesReady = true;
    } catch {
      return;
    }

    if (document.body) {
      processAndObserve();
      console.log(`[otonaguy] Ready in ${(performance.now() - t0).toFixed(0)}ms (fetched)`);
    }
  }
}

// Start observing DOM changes immediately at document_start
// This catches elements as they're added by the HTML parser
startObserving();

// Handle body appearing (if rates are ready before body, process as soon as body exists)
let bodyHandled = false;
const bodyCheckObserver = new MutationObserver(() => {
  if (document.body && ratesReady && !bodyHandled) {
    bodyHandled = true;
    bodyCheckObserver.disconnect();
    applyBodyAttributes();
    processNode(document.body);
    console.log('[otonaguy] Body appeared, processed');
  }
});
bodyCheckObserver.observe(document.documentElement, { childList: true });

// Run initialization (reads storage, sets up rates)
initialize().then(() => {
  // If body appeared while we were in initialize(), make sure it's processed
  if (document.body && ratesReady && !bodyHandled) {
    bodyHandled = true;
    bodyCheckObserver.disconnect();
    applyBodyAttributes();
    processNode(document.body);
  }
});

// Re-process full body at key moments and after delays (for JS-rendered content)
function fullReprocess(label: string): void {
  if (!ratesReady || !document.body) return;
  console.log(`[otonaguy] ${label}, re-processing`);
  removeAllAnnotations();
  showPointElements();
  autoFallbackAttempted = false;
  processNode(document.body);
}

document.addEventListener('DOMContentLoaded', () => fullReprocess('DOMContentLoaded'));
window.addEventListener('load', () => fullReprocess('load'));

// Delayed fallback for SPA / late JS-rendered content (e.g. Rakuten category pages)
setTimeout(() => fullReprocess('delayed-1s'), 1000);
setTimeout(() => fullReprocess('delayed-3s'), 3000);

// Handle settings changes
chrome.storage.onChanged.addListener((changes) => {
  if (changes.hidden) {
    isHidden = changes.hidden.newValue;
    if (isHidden) {
      document.body?.setAttribute('data-otonaguy-hidden', 'true');
    } else {
      document.body?.removeAttribute('data-otonaguy-hidden');
    }
  }

  if (changes.hideOriginal) {
    hideOriginal = changes.hideOriginal.newValue;
    if (hideOriginal) {
      document.body?.setAttribute('data-otonaguy-hide-original', 'true');
    } else {
      document.body?.removeAttribute('data-otonaguy-hide-original');
    }
  }

  if (changes.enabled || changes.targetCurrency || changes.randomCurrency) {
    // Re-read settings and re-process
    chrome.storage.local.get([
      'enabled', 'hidden', 'hideOriginal', 'targetCurrency', 'randomCurrency', 'exchangeRates',
    ]).then((data) => {
      isEnabled = data.enabled !== false;
      isHidden = data.hidden === true;
      hideOriginal = data.hideOriginal !== false;
      randomCurrency = data.randomCurrency !== false;
      targetCurrency = data.targetCurrency || 'USD';

      if (randomCurrency) {
        const candidates = SUPPORTED_CURRENCIES.filter((c) => c !== 'JPY');
        targetCurrency = candidates[Math.floor(Math.random() * candidates.length)];
      }

      if (!isEnabled || !document.body) {
        if (document.body) {
          removeAllAnnotations();
          showPointElements();
        }
        return;
      }

      const c = data.exchangeRates as CachedRates | undefined;
      if (c && c.rates) {
        rates = c.rates;
        ratesReady = true;
      }

      removeAllAnnotations();
      showPointElements();
      applyBodyAttributes();
      processNode(document.body);
    });
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'TOGGLE_HIDE') {
    isHidden = msg.value;
    if (isHidden) {
      document.body?.setAttribute('data-otonaguy-hidden', 'true');
    } else {
      document.body?.removeAttribute('data-otonaguy-hidden');
    }
    sendResponse({ success: true });
  }
  return false;
});
