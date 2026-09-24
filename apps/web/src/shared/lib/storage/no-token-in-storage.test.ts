import { beforeEach, describe, expect, it } from 'vitest';
import { entrar, resetSessionForTests } from '@/features/auth/session/session';
import { getAccessToken } from '@/shared/lib/auth-token';

// Este teste mora aqui (e não em features/auth) porque só `shared/lib/storage/` pode citar o armazenamento
// nativo: o `no-direct-access.test.ts` (CA-17) varre todo o resto do `src`.

const TOKEN = 'ACCESS-TOKEN-SINTETICO-QUE-NUNCA-PODE-SER-GRAVADO';
const usuario = {
  id: 'u1',
  nome: 'Ana Teste',
  email: 'ana@exemplo.com',
  criadoEm: '2026-09-24T12:00:00.000Z',
};

function dump(storage: Storage): string {
  return JSON.stringify(Object.fromEntries(Object.entries(storage)));
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  resetSessionForTests();
});

describe('o access token não é gravado em lugar nenhum (CA-27)', () => {
  it('depois de entrar: só em memória; nem no armazenamento local, nem no de sessão, nem em cookie', () => {
    entrar({ accessToken: TOKEN, usuario });

    expect(getAccessToken()).toBe(TOKEN);
    expect(dump(window.localStorage)).not.toContain(TOKEN);
    expect(dump(window.sessionStorage)).not.toContain(TOKEN);
    expect(document.cookie).not.toContain(TOKEN);
  });

  it('a única marca deixada no navegador é checkpoint:sessao:ativa, e vale só "true"', () => {
    entrar({ accessToken: TOKEN, usuario });

    const gravadas = Object.entries(window.localStorage);
    expect(gravadas.map(([nome]) => nome)).toContain('checkpoint:sessao:ativa');
    expect(window.localStorage.getItem('checkpoint:sessao:ativa')).toBe('true');
    for (const [, valor] of gravadas) {
      expect(valor).not.toContain(TOKEN);
      expect(valor).not.toContain(usuario.email);
    }
  });

  it('não existe IndexedDB usado pela feature (o ambiente nem o oferece; nada foi aberto)', () => {
    entrar({ accessToken: TOKEN, usuario });

    expect((globalThis as { indexedDB?: unknown }).indexedDB).toBeUndefined();
  });
});
