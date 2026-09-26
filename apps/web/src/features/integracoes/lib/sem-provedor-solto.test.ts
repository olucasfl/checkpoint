import { describe, expect, it } from 'vitest';

// Todo o código-fonte do web, menos os próprios testes e as fixtures: nenhuma tela decide por "é a Steam?".
const sources = import.meta.glob<string>(
  ['/src/**/*.{ts,tsx}', '!/src/**/*.test.{ts,tsx}', '!/src/test/**'],
  { query: '?raw', import: 'default', eager: true },
);

/** O único arquivo que escreve o código do provedor à mão (as telas que só falam com a Steam). */
const EXCECAO = '/src/features/integracoes/lib/provedores.ts';

describe('sem provedor solto nas telas', () => {
  it("o código 'STEAM' só aparece na exceção nomeada", () => {
    const achados = Object.entries(sources)
      .filter(([arquivo]) => arquivo !== EXCECAO)
      .filter(([, fonte]) => /['"`]STEAM['"`]/.test(fonte))
      .map(([arquivo]) => arquivo);
    expect(achados).toEqual([]);
  });

  it('nenhuma tela compara o provedor com um texto', () => {
    const achados = Object.entries(sources)
      .filter(([, fonte]) => /provedor\s*[!=]==?\s*['"`]/.test(fonte))
      .map(([arquivo]) => arquivo);
    expect(achados).toEqual([]);
  });

  it('a exceção existe (senão o teste acima passaria à toa)', () => {
    expect(Object.keys(sources)).toContain(EXCECAO);
  });
});
