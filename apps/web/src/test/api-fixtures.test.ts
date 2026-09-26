import { describe, expect, it } from 'vitest';
import {
  biblioteca,
  conquistas,
  conta,
  dadosSteam,
  jogosFeios,
  jogosSinteticos,
  perfilSteam,
  sessoes,
  usuario,
} from './api-fixtures';
import { problemas, type Mapa } from './contrato/forma';
import {
  AUTH_RESPONSE,
  CONTA,
  DADOS_PLATAFORMA,
  GAME,
  ITEM_BIBLIOTECA,
  PERFIL,
  SESSAO,
  USUARIO,
} from './contrato/mapas';

/**
 * CONTRATO (lado web): os corpos sintéticos que os testes e o mock do navegador usam têm EXATAMENTE a forma que a
 * API devolve (o `contrato-web.http.spec.ts` da API prova o outro lado, com corpos reais por HTTP). Sem isto, um
 * mock que esquece um campo (ou inventa um) esconde o defeito até a API real.
 */
const lista = (corpo: unknown[], mapa: Mapa) =>
  corpo.flatMap((item, i) => problemas(item, mapa, `$[${i}]`));

describe('fixtures de API = forma do shared', () => {
  it('jogos (sintéticos e "feios"), com id UUID, datas ISO e null (nunca "") sem plataforma', () => {
    expect(lista(jogosSinteticos(), GAME)).toEqual([]);
    expect(lista(jogosFeios(), GAME)).toEqual([]);
    expect(jogosFeios().every((j) => j.plataforma !== '')).toBe(true);
  });

  it('dados da plataforma, conta, perfil, biblioteca, sessões e usuário', () => {
    expect(problemas(dadosSteam(), DADOS_PLATAFORMA)).toEqual([]);
    expect(problemas(conta, CONTA)).toEqual([]);
    expect(problemas(perfilSteam, PERFIL)).toEqual([]);
    expect(lista(biblioteca(), ITEM_BIBLIOTECA)).toEqual([]);
    expect(lista(sessoes, SESSAO)).toEqual([]);
    expect(problemas(usuario, USUARIO)).toEqual([]);
    expect(problemas({ accessToken: 'x', usuario }, AUTH_RESPONSE)).toEqual([]);
    expect(conquistas().length).toBeGreaterThan(0);
  });
});

describe('o próprio validador enxerga divergências (senão o contrato não valeria nada)', () => {
  const ok = jogosSinteticos()[0];

  it('campo a mais, campo a menos, null indevido, data inválida e id que não é UUID', () => {
    expect(problemas({ ...ok, extra: 1 }, GAME).join('|')).toMatch(/extra.*NÃO declara/);
    const { titulo: _titulo, ...semTitulo } = ok as unknown as Record<string, unknown>;
    expect(problemas(semTitulo, GAME).join('|')).toMatch(/titulo.*AUSENTE/);
    expect(problemas({ ...ok, titulo: null }, GAME).join('|')).toMatch(/null onde o shared exige/);
    expect(problemas({ ...ok, criadoEm: '2026-09-25' }, GAME).join('|')).toMatch(/criadoEm/);
    expect(problemas({ ...ok, id: 'g1' }, GAME).join('|')).toMatch(/\.id: esperava uuid/);
    expect(problemas({ ...ok, plataforma: '' }, GAME)).toEqual([]);
  });

  it('dentro de objetos e listas aninhados (notas e dadosPlataforma)', () => {
    const jogo = jogosSinteticos()[0];
    const ruim = {
      ...jogo,
      notas: { ...jogo?.notas, gameplay: '9' },
      dadosPlataforma: [{ ...dadosSteam(), minutosJogados: '10' }],
    };
    const achados = problemas(ruim, GAME).join('|');
    expect(achados).toMatch(/notas\.gameplay: esperava number/);
    expect(achados).toMatch(/dadosPlataforma\[0\]\.minutosJogados: esperava number/);
  });
});
