import { describe, expect, it } from 'vitest';

// O código da feature e das telas de auth, sem os testes.
const sources = import.meta.glob<string>(
  [
    '/src/features/auth/**/*.{ts,tsx}',
    '/src/pages/{Login,Registro,Perfil}Page.tsx',
    '/src/app/layout/{RequireAuth,AuthLayout}.tsx',
    '/src/shared/lib/{auth-token,session-handlers}.ts',
    '!/src/**/*.test.{ts,tsx}',
  ],
  { query: '?raw', import: 'default', eager: true },
);

const semComentarios = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/** Compara ou procura texto dentro da `message` de um erro da API. */
const MESSAGE_COMPARISON =
  /\bmessage\s*(===|!==|==|!=)|\.message\.(includes|startsWith|endsWith|match|indexOf|search)\(/;

describe('as mensagens saem do code, não do texto da API (CA-38)', () => {
  it('a varredura enxerga a feature (não passa em vazio)', () => {
    const files = Object.keys(sources);

    expect(files.some((file) => file.endsWith('/auth-errors.ts'))).toBe(true);
    expect(files.some((file) => file.endsWith('/session.ts'))).toBe(true);
    expect(files.length).toBeGreaterThan(12);
  });

  it('nenhum arquivo compara nem procura texto na `message` da API', () => {
    const offenders = Object.entries(sources)
      .filter(([, source]) => MESSAGE_COMPARISON.test(semComentarios(source)))
      .map(([file]) => file);

    expect(offenders).toEqual([]);
  });

  it('o mapa de textos por code tem o tipo exaustivo', () => {
    const errors = Object.entries(sources).find(([file]) => file.endsWith('/auth-errors.ts'))?.[1];

    expect(errors).toContain('Record<ApiErrorCode, string>');
  });
});

describe('o access token só vive em memória (CA-27)', () => {
  const token =
    Object.entries(sources).find(([file]) => file.endsWith('/auth-token.ts'))?.[1] ?? '';

  it('o módulo do token é uma variável de módulo, sem armazenamento, cookie nem IndexedDB', () => {
    expect(token).toContain('let accessToken');
    const codigo = semComentarios(token);
    for (const proibido of ['storage', 'Storage', 'cookie', 'indexedDB', 'IndexedDB']) {
      expect(codigo, proibido).not.toContain(proibido);
    }
  });

  it('nada na feature grava o token no armazenamento (a única chave da feature é sessao:ativa)', () => {
    for (const [, source] of Object.entries(sources)) {
      for (const call of semComentarios(source).match(/storage\.set\([^)]*\)/g) ?? []) {
        expect(call).not.toMatch(/token/i);
      }
    }
  });
});
