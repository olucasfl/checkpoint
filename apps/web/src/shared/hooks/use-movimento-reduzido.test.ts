import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const prefs = vi.hoisted(() => ({ efeitos: 'completos' }));
vi.mock('./use-prefs', () => ({ usePrefs: () => prefs }));

import { useMovimentoReduzido } from './use-movimento-reduzido';

function sistemaPede(reduzir: boolean) {
  vi.stubGlobal('matchMedia', () => ({
    matches: reduzir,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

describe('useMovimentoReduzido (CA-22)', () => {
  afterEach(() => {
    prefs.efeitos = 'completos';
    vi.unstubAllGlobals();
  });

  it('movimento completo: false', () => {
    sistemaPede(false);

    expect(renderHook(() => useMovimentoReduzido()).result.current).toBe(false);
  });

  it('o sistema pede menos movimento: true', () => {
    sistemaPede(true);

    expect(renderHook(() => useMovimentoReduzido()).result.current).toBe(true);
  });

  it('"Animações: reduzidas" no /perfil: true, mesmo com o sistema livre', () => {
    sistemaPede(false);
    prefs.efeitos = 'reduzidos';

    expect(renderHook(() => useMovimentoReduzido()).result.current).toBe(true);
  });
});
