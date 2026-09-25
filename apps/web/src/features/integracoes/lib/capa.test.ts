import { type DadosJogoPlataforma } from '@checkpoint/shared';
import { describe, expect, it } from 'vitest';
import { capaOficialAlternativa, capasDoJogo } from './capa';

const OFICIAL = 'https://cdn.cloudflare.steamstatic.com/steam/apps/504230/library_600x900.jpg';
const HEADER = 'https://cdn.cloudflare.steamstatic.com/steam/apps/504230/header.jpg';

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

describe('capaOficialAlternativa', () => {
  it('troca library_600x900.jpg por header.jpg do mesmo app e da mesma CDN', () => {
    expect(capaOficialAlternativa(OFICIAL)).toBe(HEADER);
  });

  it.each([
    'https://exemplo.invalid/steam/apps/1/library_600x900.jpg',
    'http://cdn.cloudflare.steamstatic.com/steam/apps/1/library_600x900.jpg',
    'https://cdn.cloudflare.steamstatic.com/steam/apps/abc/library_600x900.jpg',
    'https://cdn.cloudflare.steamstatic.com/steam/apps/1/outra.jpg',
    'https://cdn.cloudflare.steamstatic.com/steam/apps/1/library_600x900.jpg?x=1',
    '',
  ])('%j não vira alternativa', (url) => {
    expect(capaOficialAlternativa(url)).toBeNull();
  });
});

describe('capasDoJogo: a precedência da capa (CA-42)', () => {
  it('capa enviada E vínculo: a enviada vem primeiro, depois a oficial e o header', () => {
    expect(
      capasDoJogo({ capaUrl: 'https://bucket/enviada.jpg', dadosPlataforma: [dados(OFICIAL)] }),
    ).toEqual(['https://bucket/enviada.jpg', OFICIAL, HEADER]);
  });

  it('só o vínculo: a oficial e, se ela falhar, o header', () => {
    expect(capasDoJogo({ capaUrl: null, dadosPlataforma: [dados(OFICIAL)] })).toEqual([
      OFICIAL,
      HEADER,
    ]);
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
