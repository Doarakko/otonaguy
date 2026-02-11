import { ZERO_DECIMAL_CURRENCIES } from '../shared/currencies';
import type { DetectedCurrency } from '../shared/types';

export function annotateNode(
  textNode: Text,
  detection: DetectedCurrency,
  targetCurrency: string,
  rate: number,
): void {
  const convertedAmount = detection.parsedAmount * rate;
  const formattedAmount = formatCurrency(convertedAmount, targetCurrency);

  const text = textNode.textContent!;
  const beforeText = text.slice(0, detection.startOffset);
  const afterText = text.slice(detection.endOffset);

  // Wrapper span
  const wrapper = document.createElement('span');
  wrapper.setAttribute('data-currency-converted', 'true');
  wrapper.classList.add('otonaguy-amount');

  // Original text
  const originalSpan = document.createElement('span');
  originalSpan.classList.add('otonaguy-original');
  originalSpan.textContent = detection.fullMatch;

  // Converted annotation
  const convertedSpan = document.createElement('span');
  convertedSpan.classList.add('otonaguy-converted');
  convertedSpan.textContent = formattedAmount;

  wrapper.appendChild(originalSpan);
  wrapper.appendChild(convertedSpan);

  const parent = textNode.parentNode;
  if (!parent) return;
  if (beforeText) {
    parent.insertBefore(document.createTextNode(beforeText), textNode);
  }
  parent.insertBefore(wrapper, textNode);
  if (afterText) {
    parent.insertBefore(document.createTextNode(afterText), textNode);
  }
  parent.removeChild(textNode);
}

export function formatCurrency(amount: number, currencyCode: string): string {
  const decimals = ZERO_DECIMAL_CURRENCIES.has(currencyCode) ? 0 : 2;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(amount);
  } catch {
    return `${currencyCode} ${amount.toFixed(decimals)}`;
  }
}

/**
 * Annotate a price element using CSS ::after pseudo-element via data attributes.
 * No DOM insertion needed — avoids layout/overflow issues on sites like Yahoo Shopping.
 */
export function annotateElement(
  element: HTMLElement,
  amount: number,
  fromCurrency: string,
  targetCurrency: string,
  rate: number,
): void {
  const convertedAmount = amount * rate;
  const formattedAmount = formatCurrency(convertedAmount, targetCurrency);

  element.setAttribute('data-currency-converted', 'true');
  element.classList.add('otonaguy-original');
  // CSS ::after reads these attributes to display the converted text
  element.setAttribute('data-otonaguy-converted', ` (${formattedAmount})`);
  element.setAttribute('data-otonaguy-converted-bare', formattedAmount);
}

export function removeAllAnnotations(): void {
  // Remove Strategy 2/3 annotations (::after via data attributes)
  const strategy2 = document.querySelectorAll('.otonaguy-original[data-currency-converted]');
  for (const el of strategy2) {
    el.removeAttribute('data-currency-converted');
    el.removeAttribute('data-otonaguy-converted');
    el.removeAttribute('data-otonaguy-converted-bare');
    el.classList.remove('otonaguy-original');
  }

  // Remove legacy sibling annotations (in case any remain)
  const siblings = document.querySelectorAll('.otonaguy-sibling');
  for (const el of siblings) {
    el.remove();
  }

  // Restore wrapped text nodes (Strategy 1)
  const strategy1 = document.querySelectorAll('.otonaguy-amount[data-currency-converted]');
  for (const el of strategy1) {
    const original = el.querySelector('.otonaguy-original');
    if (original) {
      const textNode = document.createTextNode(original.textContent || '');
      el.parentNode?.replaceChild(textNode, el);
    }
  }
}
