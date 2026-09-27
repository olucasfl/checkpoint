import { describe, expect, it } from 'vitest';
import {
  PLATAFORMAS,
  PLATAFORMAS_EM_ORDEM,
  PROVEDOR_SLUG,
  plataformasDisponiveis,
  temCapacidade,
} from '@checkpoint/shared';

// O cadastro global vive no `shared` (que não tem runner): o web o testa, como o `PlataformaMarca.test.tsx`.
describe('cadastro global de plataformas (spec integracao-playstation, CA-24)', () => {
  it('a PlayStation está no cadastro, por credencial, sem logo e com o vocabulário de troféus', () => {
    expect(PLATAFORMAS.PLAYSTATION).toMatchObject({
      slug: 'playstation',
      nome: 'PlayStation',
      logo: null,
      marcador: { icone: 'videogame_asset' },
      vinculo: { tipo: 'credencial', rotuloDaCredencial: 'NPSSO' },
      vocabulario: { conquista: 'troféu', conquistas: 'troféus' },
      privacidade: null,
      rodapeLegal: {
        atribuicao: null,
        naoAfiliado: 'Não afiliado à Sony Interactive Entertainment',
      },
    });
    expect(PROVEDOR_SLUG.PLAYSTATION).toBe('playstation');
  });

  it('a Steam continua por redirecionamento, com o passo a passo de privacidade e a atribuição da Valve', () => {
    expect(PLATAFORMAS.STEAM.vinculo).toEqual({
      tipo: 'redirecionamento',
      hostDeLogin: 'steamcommunity.com',
      caminhoDeLogin: '/openid/login',
    });
    expect(PLATAFORMAS.STEAM.privacidade?.passos.join(' ')).toContain('"Meu perfil" como Público');
    expect(PLATAFORMAS.STEAM.rodapeLegal.naoAfiliado).toBe('Não afiliado à Valve');
    expect(PLATAFORMAS.STEAM.vocabulario.conquistas).toBe('conquistas');
  });

  it('só o que tem provider e tela aparece nas telas (`disponivel`)', () => {
    expect(plataformasDisponiveis().map((p) => p.id)).toEqual(
      PLATAFORMAS_EM_ORDEM.filter((p) => p.disponivel).map((p) => p.id),
    );
  });

  it('o backlog é capacidade só da Steam; nível e conquistas existem nas duas', () => {
    expect(temCapacidade('STEAM', 'backlog')).toBe(true);
    expect(temCapacidade('PLAYSTATION', 'backlog')).toBe(false);
    expect(temCapacidade('PLAYSTATION', 'nivel')).toBe(true);
    expect(temCapacidade('PLAYSTATION', 'conquistas')).toBe(true);
  });
});
