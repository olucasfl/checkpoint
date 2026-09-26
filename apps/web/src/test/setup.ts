import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { limparAvisos } from '@/shared/lib/avisos';

// O módulo virtual do plugin de PWA só existe no build do Vite; os testes nunca registram um SW.
// Cada teste que quer outro estado sobrescreve este mock (ver UpdatePrompt.test.tsx).
vi.mock('@/shared/lib/pwa/use-app-update', () => ({
  useAppUpdate: () => ({
    precisaAtualizar: false,
    atualizar: () => undefined,
    adiar: () => undefined,
  }),
}));

// Sem `globals: true`, o RTL nao registra o cleanup automatico: desmonta a arvore apos cada teste.
afterEach(() => {
  cleanup();
  limparAvisos();
});

// O jsdom nao implementa `<dialog>.showModal()/close()`. Este polyfill minimo reproduz o que os testes
// observam: o atributo `open` e o evento `close`, que o React entrega em `onClose`, e a volta do foco ao
// elemento que abriu (o navegador faz isso ao fechar um diálogo modal).
const abriuComFoco = new WeakMap<HTMLDialogElement, Element | null>();
const dialog = globalThis.HTMLDialogElement?.prototype;
if (dialog) {
  dialog.showModal = function showModal(this: HTMLDialogElement) {
    abriuComFoco.set(this, document.activeElement);
    this.setAttribute('open', '');
  };
  dialog.close = function close(this: HTMLDialogElement) {
    if (this.hasAttribute('open')) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
      (abriuComFoco.get(this) as HTMLElement | null | undefined)?.focus?.();
    }
  };
}

// O jsdom tambem nao tem URL.createObjectURL (usado no preview da capa escolhida).
if (!URL.createObjectURL) {
  URL.createObjectURL = vi.fn(() => 'blob:preview-de-teste');
  URL.revokeObjectURL = vi.fn();
}
