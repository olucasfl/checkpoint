import { type Conquista, type DadosJogoPlataforma, type Game } from '@checkpoint/shared';
import { describe, expect, it } from 'vitest';
import {
  comDadosAtualizados,
  dataCurta,
  desbloqueadaEmTexto,
  horasEMinutos,
  progressoDasConquistas,
  raridadeTexto,
  separarConquistas,
  ultimoJogoTexto,
} from './conquistas';

// Meio-dia UTC: o mesmo dia civil em qualquer fuso do Brasil ao Japão.
const DIA = '2026-02-17T12:00:00.000Z';

describe('horasEMinutos', () => {
  it.each([
    [0, '0 min'],
    [45, '45 min'],
    [60, '1 h'],
    [2550, '42 h 30 min'],
    [2520, '42 h'],
    [-5, '0 min'],
    [61.9, '1 h 1 min'],
  ])('%s min → %s', (minutos, texto) => {
    expect(horasEMinutos(minutos)).toBe(texto);
  });
});

describe('datas e textos', () => {
  it('dd/mm/aaaa, e nunca "Invalid Date"', () => {
    expect(dataCurta(DIA)).toBe('17/02/2026');
    expect(dataCurta(null)).toBeNull();
    expect(dataCurta('lixo')).toBeNull();
  });

  it('"Último jogo em …" ou "Nunca jogado" com data nula (CA-51)', () => {
    expect(ultimoJogoTexto(DIA)).toBe('Último jogo em 17/02/2026');
    expect(ultimoJogoTexto(null)).toBe('Nunca jogado');
    expect(ultimoJogoTexto('lixo')).toBe('Nunca jogado');
  });

  it('"Desbloqueada em …" ou nada', () => {
    expect(desbloqueadaEmTexto(DIA)).toBe('Desbloqueada em 17/02/2026');
    expect(desbloqueadaEmTexto(null)).toBeNull();
  });

  it('raridade com vírgula e uma casa, ou "Raridade indisponível" (CA-50, CA-52)', () => {
    expect(raridadeTexto(12.4)).toBe('12,4% dos jogadores');
    expect(raridadeTexto(97)).toBe('97,0% dos jogadores');
    expect(raridadeTexto(null)).toBe('Raridade indisponível');
  });
});

const conquista = (id: string, extra: Partial<Conquista> = {}): Conquista => ({
  id,
  nome: id,
  descricao: null,
  oculta: false,
  desbloqueada: false,
  desbloqueadaEm: null,
  iconeUrl: null,
  raridadePercentual: null,
  ...extra,
});

describe('separarConquistas (CA-52)', () => {
  it('desbloqueadas: data decrescente; faltam: da mais comum à mais rara, sem percentual no fim', () => {
    const { desbloqueadas, faltam } = separarConquistas([
      conquista('velha', { desbloqueada: true, desbloqueadaEm: '2025-01-01T12:00:00.000Z' }),
      conquista('nova', { desbloqueada: true, desbloqueadaEm: '2026-01-01T12:00:00.000Z' }),
      conquista('rara', { raridadePercentual: 1.5 }),
      conquista('comum', { raridadePercentual: 80 }),
      conquista('sem', { raridadePercentual: null }),
      conquista('media', { raridadePercentual: 20 }),
    ]);

    expect(desbloqueadas.map((c) => c.id)).toEqual(['nova', 'velha']);
    expect(faltam.map((c) => c.id)).toEqual(['comum', 'media', 'rara', 'sem']);
  });

  it('não altera a lista recebida', () => {
    const entrada = [conquista('b'), conquista('a')];
    separarConquistas(entrada);
    expect(entrada.map((c) => c.id)).toEqual(['b', 'a']);
  });

  it('lista vazia dá duas listas vazias', () => {
    expect(separarConquistas([])).toEqual({ desbloqueadas: [], faltam: [] });
  });
});

describe('progressoDasConquistas', () => {
  it('"12 de 40 conquistas" e a fração', () => {
    expect(progressoDasConquistas(12, 40)).toEqual({
      texto: '12 de 40 conquistas',
      percentual: 30,
      desbloqueadas: 12,
      total: 40,
    });
    expect(progressoDasConquistas(1, 1)?.texto).toBe('1 de 1 conquista');
  });

  it('sem total (negado) ou com total 0 (sem conquistas): sem barra', () => {
    expect(progressoDasConquistas(null, null)).toBeNull();
    expect(progressoDasConquistas(0, 0)).toBeNull();
  });

  it('a fração nunca passa de 100', () => {
    expect(progressoDasConquistas(9, 3)?.percentual).toBe(100);
  });
});

describe('comDadosAtualizados (o detalhe atualiza o catálogo sem refazer a lista)', () => {
  const dados = (minutos: number): DadosJogoPlataforma => ({
    provedor: 'STEAM',
    idExterno: '1',
    minutosJogados: minutos,
    ultimaVezJogadoEm: null,
    conquistasTotal: 3,
    conquistasDesbloqueadas: 1,
    capaUrl: null,
    atualizadoEm: '2026-09-25T12:00:00.000Z',
  });
  const jogo = (id: string, dadosPlataforma: DadosJogoPlataforma[]): Game => ({
    id,
    titulo: id,
    plataforma: 'PC',
    status: 'JOGANDO',
    notas: {
      gameplay: null,
      historia: null,
      graficos: null,
      trilhaSonora: null,
      performance: null,
    },
    notaMedia: null,
    descricao: null,
    capaUrl: null,
    criadoEm: '2026-09-23T12:00:00.000Z',
    dadosPlataforma,
    atualizadoEm: '2026-09-23T12:00:00.000Z',
  });

  it('troca só a camada do jogo certo; os outros ficam idênticos', () => {
    const a = jogo('a', [dados(5)]);
    const b = jogo('b', [dados(7)]);

    const novo = comDadosAtualizados([a, b], 'a', dados(600));

    expect(novo?.[0]?.dadosPlataforma[0]?.minutosJogados).toBe(600);
    expect(novo?.[1]).toBe(b);
  });

  it('jogo sem camada não ganha uma do nada; lista ausente fica ausente', () => {
    const sem = jogo('a', []);
    expect(comDadosAtualizados([sem], 'a', dados(1))?.[0]?.dadosPlataforma).toEqual([]);
    expect(comDadosAtualizados(undefined, 'a', dados(1))).toBeUndefined();
  });
});
