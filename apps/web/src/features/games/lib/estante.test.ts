import { type DadosJogoPlataforma, type Game, type GameStatus } from '@checkpoint/shared';
import { describe, expect, it } from 'vitest';
import {
  agruparEmPrateleiras,
  chipsDoDestaque,
  destaqueDoCatalogo,
  nomeDaPlataforma,
} from './estante';

const jogo = (id: string, status: GameStatus, extra: Partial<Game> = {}): Game => ({
  id,
  titulo: id,
  plataforma: null,
  status,
  notas: { gameplay: null, historia: null, graficos: null, trilhaSonora: null, performance: null },
  notaMedia: null,
  descricao: null,
  capaUrl: null,
  criadoEm: '2026-09-23T12:00:00.000Z',
  dadosPlataforma: [],
  atualizadoEm: '2026-09-23T12:00:00.000Z',
  ...extra,
});

const steam = (extra: Partial<DadosJogoPlataforma> = {}): DadosJogoPlataforma => ({
  provedor: 'STEAM',
  idExterno: '1',
  minutosJogados: 2550,
  ultimaVezJogadoEm: null,
  conquistasTotal: 40,
  conquistasDesbloqueadas: 12,
  capaUrl: null,
  atualizadoEm: '2026-09-25T12:00:00.000Z',
  ...extra,
});

describe('agruparEmPrateleiras (CA-20, CA-27)', () => {
  const lista = [
    jogo('z1', 'ZERADO'),
    jogo('j1', 'JOGANDO'),
    jogo('q1', 'QUERO_JOGAR'),
    jogo('j2', 'JOGANDO'),
  ];

  it('Todos: as três na ordem da tela, cada uma com os jogos na ordem que a API mandou', () => {
    const prateleiras = agruparEmPrateleiras(lista, 'TODOS');

    expect(prateleiras.map((p) => [p.titulo, p.jogos.map((g) => g.id)])).toEqual([
      ['Jogando agora', ['j1', 'j2']],
      ['Quero jogar', ['q1']],
      ['Zerados', ['z1']],
    ]);
  });

  it('só aparece a prateleira com pelo menos um jogo', () => {
    const prateleiras = agruparEmPrateleiras(
      [jogo('j1', 'JOGANDO'), jogo('z1', 'ZERADO')],
      'TODOS',
    );

    expect(prateleiras.map((p) => p.titulo)).toEqual(['Jogando agora', 'Zerados']);
  });

  it('um filtro de status mostra só a prateleira dele; sem jogos nele, nenhuma', () => {
    expect(agruparEmPrateleiras(lista, 'ZERADO').map((p) => p.titulo)).toEqual(['Zerados']);
    expect(agruparEmPrateleiras([jogo('j1', 'JOGANDO')], 'ZERADO')).toEqual([]);
    expect(agruparEmPrateleiras([], 'TODOS')).toEqual([]);
  });

  it('cada prateleira leva o ícone e o status', () => {
    const [jogando] = agruparEmPrateleiras(lista, 'JOGANDO');

    expect(jogando).toMatchObject({ status: 'JOGANDO', icone: 'sports_esports' });
  });
});

describe('destaqueDoCatalogo (CA-15, CA-17, CA-18, CA-19)', () => {
  const lista = [
    jogo('recente', 'JOGANDO'),
    jogo('quero', 'QUERO_JOGAR'),
    jogo('antigo', 'JOGANDO'),
  ];

  it('é o primeiro Jogando da lista (a mais recente por atualizadoEm)', () => {
    expect(destaqueDoCatalogo(lista, 'TODOS')?.id).toBe('recente');
    expect(destaqueDoCatalogo(lista, 'JOGANDO')?.id).toBe('recente');
  });

  it('sem nenhum Jogando, o destaque some', () => {
    expect(destaqueDoCatalogo([jogo('q', 'QUERO_JOGAR'), jogo('z', 'ZERADO')], 'TODOS')).toBeNull();
    expect(destaqueDoCatalogo([], 'TODOS')).toBeNull();
  });

  it('só com o filtro Todos ou Jogando, mesmo havendo Jogando', () => {
    expect(destaqueDoCatalogo(lista, 'QUERO_JOGAR')).toBeNull();
    expect(destaqueDoCatalogo(lista, 'ZERADO')).toBeNull();
  });

  it('a ordem da lista manda: quem foi editado depois (vem antes) vira o destaque', () => {
    expect(destaqueDoCatalogo([lista[2] as Game, lista[0] as Game], 'TODOS')?.id).toBe('antigo');
  });
});

describe('nomeDaPlataforma (o "XIS" de Xbox Series X|S)', () => {
  it('troca a barra vertical por "/" só na exibição', () => {
    expect(nomeDaPlataforma('Xbox Series X|S')).toBe('Xbox Series X/S');
    expect(nomeDaPlataforma('A|B|C')).toBe('A/B/C');
  });

  it.each(['PC', 'Nintendo Switch', 'PS5', ''])('%j fica igual', (nome) => {
    expect(nomeDaPlataforma(nome)).toBe(nome);
  });
});

describe('chipsDoDestaque (CA-15, CA-16)', () => {
  it('jogo ligado com média: plataforma, média, horas e conquistas', () => {
    const chips = chipsDoDestaque(
      jogo('a', 'JOGANDO', {
        plataforma: 'Xbox Series X|S',
        notaMedia: 8.3,
        dadosPlataforma: [steam()],
      }),
    );

    expect(chips).toEqual({
      plataforma: 'Xbox Series X/S',
      media: '8,3',
      horas: '42 h 30 min na Steam',
      conquistas: '12/40 conquistas',
    });
  });

  it('jogo NÃO ligado: sem horas nem conquistas; sem plataforma e sem média: nada disso', () => {
    expect(chipsDoDestaque(jogo('a', 'JOGANDO'))).toEqual({
      plataforma: null,
      media: null,
      horas: null,
      conquistas: null,
    });
  });

  it('média 0 é nota (mostra "0,0"); plataforma só de espaços não vira chip', () => {
    const chips = chipsDoDestaque(jogo('a', 'JOGANDO', { notaMedia: 0, plataforma: '   ' }));

    expect(chips.media).toBe('0,0');
    expect(chips.plataforma).toBeNull();
  });

  it.each([
    ['total 0 (o jogo não tem conquistas)', { conquistasTotal: 0, conquistasDesbloqueadas: 0 }],
    ['negadas (null)', { conquistasTotal: null, conquistasDesbloqueadas: null }],
  ])('ligado, mas com %s: só as horas', (_nome, extra) => {
    const chips = chipsDoDestaque(jogo('a', 'JOGANDO', { dadosPlataforma: [steam(extra)] }));

    expect(chips.horas).toBe('42 h 30 min na Steam');
    expect(chips.conquistas).toBeNull();
  });
});
