import { describe, expect, it } from 'vitest';
import { PROVEDORES } from '@checkpoint/shared';

// Todo o código-fonte do web, menos os próprios testes e as fixtures: nenhuma tela decide por "é a Steam?" nem por "é
// a PlayStation?". Com dois provedores, escolher um à mão é um bug: as telas recebem o provedor por prop ou pelo
// cadastro (`@checkpoint/shared`).
const sources = import.meta.glob<string>(
  ['/src/**/*.{ts,tsx}', '!/src/**/*.test.{ts,tsx}', '!/src/test/**'],
  { query: '?raw', import: 'default', eager: true },
);

describe('sem provedor solto nas telas', () => {
  it.each(PROVEDORES)(
    "o código '%s' não aparece em nenhum arquivo do web (sem exceção)",
    (codigo) => {
      const achados = Object.entries(sources)
        .filter(([, fonte]) => new RegExp(`['"\`]${codigo}['"\`]`).test(fonte))
        .map(([arquivo]) => arquivo);
      expect(achados).toEqual([]);
    },
  );

  it('nenhuma tela compara o provedor com um texto', () => {
    const achados = Object.entries(sources)
      .filter(([, fonte]) => /provedor\s*[!=]==?\s*['"`]/.test(fonte))
      .map(([arquivo]) => arquivo);
    expect(achados).toEqual([]);
  });

  it('as constantes do provedor fixo acabaram (PROVEDOR_STEAM, useTemContaSteam)', () => {
    const achados = Object.entries(sources)
      .filter(([, fonte]) => /PROVEDOR_STEAM|useTemContaSteam|urlDaSteamSegura/.test(fonte))
      .map(([arquivo]) => arquivo);
    expect(achados).toEqual([]);
  });

  it('o levantamento enxerga o código-fonte (senão os testes acima passariam à toa)', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(50);
    expect(Object.keys(sources)).toContain('/src/features/integracoes/api/use-integracoes.ts');
  });
});
