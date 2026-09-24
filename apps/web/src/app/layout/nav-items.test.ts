import { describe, expect, it } from 'vitest';
import { NAV_ITEMS, NAV_LINKS } from './nav-items';

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
