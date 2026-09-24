import { describe, expect, it } from 'vitest';
import { NAV_ITEMS, NAV_LINKS } from './nav-items';

describe('NAV_ITEMS (pwa-e-mobile CA-02)', () => {
  it('etapa 1: Jogos e Adicionar, nesta ordem, sem Perfil e sem /status', () => {
    expect(NAV_ITEMS.map((item) => item.label)).toEqual(['Jogos', 'Adicionar']);
    expect(NAV_ITEMS).toContainEqual(expect.objectContaining({ kind: 'link', to: '/' }));
    expect(NAV_ITEMS.find((item) => item.id === 'adicionar')?.kind).toBe('novo-jogo');
    expect(NAV_LINKS.map((item) => item.to)).not.toContain('/status');
  });

  it('ids únicos (são as chaves da lista)', () => {
    const ids = NAV_ITEMS.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
