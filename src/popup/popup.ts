import { SUPPORTED_CURRENCIES, CURRENCY_NAMES } from '../shared/currencies';

export async function initPopup(): Promise<void> {
  const targetSelect = document.getElementById('target-currency') as HTMLSelectElement;
  const targetField = document.getElementById('target-field')!;
  const randomToggle = document.getElementById('random-toggle') as HTMLInputElement;
  const hideOriginalToggle = document.getElementById('hide-original-toggle') as HTMLInputElement;
  const hideToggle = document.getElementById('hide-toggle') as HTMLInputElement;
  const enableToggle = document.getElementById('enable-toggle') as HTMLInputElement;

  // Populate currency dropdown
  for (const code of SUPPORTED_CURRENCIES) {
    const name = CURRENCY_NAMES[code] || code;
    targetSelect.add(new Option(`${code} - ${name}`, code));
  }

  // Load saved preferences
  const prefs = await chrome.storage.local.get([
    'targetCurrency',
    'randomCurrency',
    'hideOriginal',
    'hidden',
    'enabled',
  ]);
  targetSelect.value = prefs.targetCurrency || 'USD';
  randomToggle.checked = prefs.randomCurrency !== false;
  hideOriginalToggle.checked = prefs.hideOriginal === true;
  hideToggle.checked = prefs.hidden === true;
  enableToggle.checked = prefs.enabled !== false;

  // Hide dropdown when random is enabled
  function updateTargetFieldVisibility(): void {
    targetField.style.display = randomToggle.checked ? 'none' : '';
  }
  updateTargetFieldVisibility();

  // Event listeners
  randomToggle.addEventListener('change', async () => {
    await chrome.storage.local.set({ randomCurrency: randomToggle.checked });
    updateTargetFieldVisibility();
  });

  targetSelect.addEventListener('change', async () => {
    await chrome.storage.local.set({ targetCurrency: targetSelect.value });
  });

  hideOriginalToggle.addEventListener('change', async () => {
    await chrome.storage.local.set({ hideOriginal: hideOriginalToggle.checked });
  });

  hideToggle.addEventListener('change', async () => {
    await chrome.storage.local.set({ hidden: hideToggle.checked });
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, {
        type: 'TOGGLE_HIDE',
        value: hideToggle.checked,
      }).catch(() => {});
    }
  });

  enableToggle.addEventListener('change', async () => {
    await chrome.storage.local.set({ enabled: enableToggle.checked });
  });
}
