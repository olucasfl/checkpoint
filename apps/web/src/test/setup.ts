import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Sem `globals: true`, o RTL nao registra o cleanup automatico: desmonta a arvore apos cada teste.
afterEach(() => {
  cleanup();
});

// O jsdom nao implementa `<dialog>.showModal()/close()`. Este polyfill minimo reproduz o que os testes
// observam: o atributo `open` e o evento `close`, que o React entrega em `onClose`.
const dialog = globalThis.HTMLDialogElement?.prototype;
if (dialog) {
  dialog.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  dialog.close = function close(this: HTMLDialogElement) {
    if (this.hasAttribute('open')) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    }
  };
}

// O jsdom tambem nao tem URL.createObjectURL (usado no preview da capa escolhida).
if (!URL.createObjectURL) {
  URL.createObjectURL = vi.fn(() => 'blob:preview-de-teste');
  URL.revokeObjectURL = vi.fn();
}
