export function observeDOMChanges(
  processNode: (root: Node) => void,
): MutationObserver {
  const observer = new MutationObserver((mutations) => {
    const addedNodes = new Set<Node>();

    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        for (const node of mutation.addedNodes) {
          // Skip our own annotations
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

    for (const node of addedNodes) {
      processNode(node);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  return observer;
}
