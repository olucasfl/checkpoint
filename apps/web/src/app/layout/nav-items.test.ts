import { describe, expect, it } from 'vitest';
import { isNavActive, NAV_ITEMS, NAV_LINKS } from './nav-items';

describe('NAV_ITEMS (pwa-e-mobile CA-02)', () => {
  it('Jogos, Adicionar e Perfil, nesta ordem, sem /status (autenticacao CA-36)', () => {
    expect(NAV_ITEMS.map((item) => item.label)).toEqual(['Jogos', 'Adicionar', 'Perfil']);
    expect(NAV_ITEMS).toContainEqual(expect.objectContaining({ kind: 'link', to: '/' }));
    expect(NAV_ITEMS).toContainEqual(expect.objectContaining({ kind: 'link', to: '/perfil' }));
    expect(NAV_ITEMS.find((item) => item.id === 'adicionar')?.kind).toBe('novo-jogo');
    expect(NAV_LINKS.map((item) => item.to)).toEqual(['/', '/perfil']);
    expect(NAV_LINKS.map((item) => item.to)).not.toContain('/status');
  });

  it('ids únicos (são as chaves da lista)', () => {
    const ids = NAV_ITEMS.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('isNavActive (avaliacao-de-jogos CA-29)', () => {
  const jogos = NAV_LINKS.find((item) => item.id === 'jogos');
  const perfil = NAV_LINKS.find((item) => item.id === 'perfil');
  if (!jogos || !perfil) {
    throw new Error('itens da navegação não encontrados');
  }

  it('Jogos é ativo em `/` e sob `/jogos/` (o detalhe de um jogo)', () => {
    expect(isNavActive(jogos, '/')).toBe(true);
    expect(isNavActive(jogos, '/jogos/3f2b8a52-9c1e-4d6a-8f31-0a7e5b2c9d44')).toBe(true);
    expect(isNavActive(jogos, '/jogos/qualquer')).toBe(true);
  });

  it('Jogos não casa com o resto: `/` não é prefixo de tudo', () => {
    for (const caminho of ['/perfil', '/perfil/senha', '/status', '/jogosx', '/jogos']) {
      expect(isNavActive(jogos, caminho), caminho).toBe(false);
    }
  });

  it('Perfil é ativo só em `/perfil` (comportamento de antes: /perfil/senha não o marca)', () => {
    expect(isNavActive(perfil, '/perfil')).toBe(true);
    expect(isNavActive(perfil, '/perfil/senha')).toBe(false);
    expect(isNavActive(perfil, '/')).toBe(false);
    expect(isNavActive(perfil, '/jogos/g1')).toBe(false);
  });
});
