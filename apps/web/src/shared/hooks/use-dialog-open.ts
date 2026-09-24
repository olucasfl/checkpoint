import { useSyncExternalStore } from 'react';

const OPEN_DIALOG = 'dialog[open]';

function subscribe(onChange: () => void): () => void {
  // `open` é atributo: o `showModal()`/`close()` nativos o ligam e desligam sem passar pelo React.
  const observer = new MutationObserver(onChange);
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['open'],
  });
  return () => observer.disconnect();
}

function getSnapshot(): boolean {
  return document.querySelector(OPEN_DIALOG) !== null;
}

/** Há algum `<dialog open>` no documento? Avisos não modais se escondem enquanto há um. */
export function useDialogOpen(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot);
}
