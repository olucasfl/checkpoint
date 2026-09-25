import { type DadosJogoPlataforma } from '@checkpoint/shared';
import { describe, expect, it } from 'vitest';
import { capasDoJogo } from './capa';

const OFICIAL = 'https://cdn.cloudflare.steamstatic.com/steam/apps/504230/library_600x900.jpg';

const dados = (capaUrl: string | null): DadosJogoPlataforma => ({
  provedor: 'STEAM',
  idExterno: '504230',
  minutosJogados: 1,
  ultimaVezJogadoEm: null,
  conquistasTotal: null,
  conquistasDesbloqueadas: null,
  capaUrl,
  atualizadoEm: '2026-09-25T12:00:00.000Z',
});

describe('capasDoJogo: a precedência da capa, sem header.jpg (CA-39)', () => {
  it('capa enviada E vínculo: a enviada vem primeiro, depois a oficial', () => {
    expect(
      capasDoJogo({ capaUrl: 'https://bucket/enviada.jpg', dadosPlataforma: [dados(OFICIAL)] }),
    ).toEqual(['https://bucket/enviada.jpg', OFICIAL]);
  });

  it('só o vínculo: a oficial (e nenhuma alternativa: o header.jpg saiu da cadeia)', () => {
    expect(capasDoJogo({ capaUrl: null, dadosPlataforma: [dados(OFICIAL)] })).toEqual([OFICIAL]);
  });

  it('remover a capa enviada faz a oficial reaparecer (nada gravado no web)', () => {
    const jogo = { capaUrl: 'https://bucket/enviada.jpg', dadosPlataforma: [dados(OFICIAL)] };
    expect(capasDoJogo(jogo)[0]).toBe('https://bucket/enviada.jpg');
    expect(capasDoJogo({ ...jogo, capaUrl: null })[0]).toBe(OFICIAL);
  });

  it('sem enviada e sem vínculo: nenhuma imagem (vale a capa gerada)', () => {
    expect(capasDoJogo({ capaUrl: null, dadosPlataforma: [] })).toEqual([]);
    expect(capasDoJogo({ capaUrl: null, dadosPlataforma: [dados(null)] })).toEqual([]);
  });

  it('só a enviada: sem alternativas', () => {
    expect(capasDoJogo({ capaUrl: 'https://bucket/x.jpg', dadosPlataforma: [] })).toEqual([
      'https://bucket/x.jpg',
    ]);
  });
});
