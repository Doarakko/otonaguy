import { SKIP_TAGS, QUICK_CURRENCY_TEST } from '../shared/constants';

/**
 * Strategy 1: Find individual text nodes that contain currency patterns.
 * Works for simple cases like "Price: $100"
 */
export function findTextNodesWithCurrency(root: Node): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node: Text): number {
      if (!node.textContent || node.textContent.trim().length < 1) {
        return NodeFilter.FILTER_REJECT;
      }
      if (shouldSkipNode(node)) {
        return NodeFilter.FILTER_REJECT;
      }
      if (QUICK_CURRENCY_TEST.test(node.textContent)) {
        return NodeFilter.FILTER_ACCEPT;
      }
      return NodeFilter.FILTER_REJECT;
    },
  });

  const results: Text[] = [];
  while (walker.nextNode()) {
    results.push(walker.currentNode as Text);
  }
  return results;
}

/**
 * Strategy 2: Find elements whose combined innerText contains currency patterns,
 * but where individual text nodes don't (e.g., <span>$</span><span>100</span>).
 * Returns elements that should be processed as a whole.
 */
export function findPriceElements(root: Node): HTMLElement[] {
  if (!(root instanceof HTMLElement)) return [];

  const results: HTMLElement[] = [];

  // Common selectors for price elements on EC sites
  const selectors = [
    '.a-price',           // Amazon
    '[class*="price"]',
    '[class*="Price"]',
    '[class*="cost"]',
    '[class*="Cost"]',
    '[class*="amount"]',
    '[class*="Amount"]',
    '[data-price]',
    '[itemprop="price"]',
  ];

  const combinedSelector = selectors.join(',');

  try {
    // Check the root element itself (querySelectorAll only searches descendants)
    if (root.matches && root.matches(combinedSelector)) {
      if (!root.closest('[data-currency-converted]') && !root.querySelector('[data-currency-converted]')) {
        const text = root.innerText || root.textContent || '';
        if (text.trim().length > 0 && QUICK_CURRENCY_TEST.test(text)) {
          results.push(root);
        }
      }
    }

    const elements = root.querySelectorAll
      ? root.querySelectorAll(combinedSelector)
      : [];
    for (const el of elements) {
      if (!(el instanceof HTMLElement)) continue;
      if (el.closest('[data-currency-converted]')) continue;
      if (el.querySelector('[data-currency-converted]')) continue;

      const text = el.innerText || el.textContent || '';
      if (text.trim().length > 0 && QUICK_CURRENCY_TEST.test(text)) {
        results.push(el);
      }
    }
  } catch {
    // querySelectorAll might fail on certain nodes
  }

  return results;
}

// Regex matching text that is ONLY a currency symbol/suffix (no number)
const CURRENCY_SYMBOL_ONLY =
  /^[$€£¥￥₹₩円元]$|^R\$$|^kr$|^Kč$|^Ft$|^zł$|^Fr$/;

// Test that text contains BOTH a digit and a currency indicator
const HAS_NUMBER_AND_CURRENCY =
  /\d.*[$€£¥￥₹₩円元]|[$€£¥￥₹₩円元].*\d|R\$.*\d|\d.*(?:kr|Kč|Ft|zł|Fr)/;

/**
 * Strategy 3: Find elements with split currency nodes.
 * Handles cases like <p><span>6,980</span><span>円</span></p> where the
 * currency symbol and number are in separate child elements.
 * Walks text nodes looking for isolated currency symbols, then checks
 * ancestor elements for combined text that matches a currency pattern.
 */
export function findSplitCurrencyElements(root: Node): HTMLElement[] {
  if (!(root instanceof HTMLElement)) return [];

  const results: HTMLElement[] = [];
  const seen = new Set<HTMLElement>();

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node: Text): number {
      if (shouldSkipNode(node)) return NodeFilter.FILTER_REJECT;
      const text = (node.textContent || '').trim();
      if (CURRENCY_SYMBOL_ONLY.test(text)) return NodeFilter.FILTER_ACCEPT;
      return NodeFilter.FILTER_REJECT;
    },
  });

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const parent = node.parentElement;
    if (!parent) continue;

    // Climb up to find the smallest ancestor containing both number and symbol
    let el: HTMLElement | null = parent;
    for (let depth = 0; el && depth < 4; depth++, el = el.parentElement) {
      if (seen.has(el)) break;
      if (el.closest('[data-currency-converted]')) break;
      if (el.querySelector('[data-currency-converted]')) break;
      if (SKIP_TAGS.has(el.tagName)) break;

      const combinedText = (el.innerText || el.textContent || '').trim();
      if (combinedText.length > 200) break;

      // Require both a number and a currency symbol (not just "円" alone)
      if (HAS_NUMBER_AND_CURRENCY.test(combinedText)) {
        seen.add(el);
        results.push(el);
        break;
      }
    }
  }

  return results;
}

export function shouldSkipNode(node: Text): boolean {
  const parent = node.parentElement;
  if (!parent) return true;

  if (SKIP_TAGS.has(parent.tagName)) return true;

  if (parent.isContentEditable) return true;

  if (parent.closest('[data-currency-converted]')) return true;

  // Skip visually hidden elements (Amazon uses a-offscreen for screen readers)
  // These will be handled by Strategy 2 at the parent element level
  if (parent.classList.contains('a-offscreen')) return true;
  if (parent.closest('.a-offscreen')) return true;

  // Skip if parent is inside a price container that Strategy 2 will handle
  // (split nodes like <span class="a-price-symbol">￥</span><span class="a-price-whole">4,920</span>)
  if (parent.closest('.a-price')) return true;

  return false;
}
