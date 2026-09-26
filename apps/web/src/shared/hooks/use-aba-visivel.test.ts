import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useAbaVisivel } from './use-aba-visivel';

function definirOculta(valor: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => valor });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('useAbaVisivel (CA-24)', () => {
  it('marca data-aba-oculta no <html> com a aba oculta e tira ao voltar', () => {
    const { unmount } = renderHook(() => useAbaVisivel());

    expect(document.documentElement).not.toHaveAttribute('data-aba-oculta');
    definirOculta(true);
    expect(document.documentElement).toHaveAttribute('data-aba-oculta');
    definirOculta(false);
    expect(document.documentElement).not.toHaveAttribute('data-aba-oculta');

    definirOculta(true);
    unmount();
    expect(document.documentElement).not.toHaveAttribute('data-aba-oculta');
    definirOculta(false);
  });
});
