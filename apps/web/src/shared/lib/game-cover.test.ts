import { describe, expect, it } from 'vitest';
import { COVER_BACKGROUNDS, coverBackground, coverColorIndex, coverInitials } from './game-cover';

describe('coverColorIndex — hash determinístico (CA-72)', () => {
  it('dá valores fixos para títulos conhecidos (trava mudanças acidentais no algoritmo)', () => {
    // Valores calculados com uma implementação independente de FNV-1a (32 bits) em Node.
    expect(coverColorIndex('Hollow Knight')).toBe(1);
    expect(coverColorIndex('Celeste')).toBe(2);
    expect(coverColorIndex('Outer Wilds')).toBe(5);
    expect(coverColorIndex('Hades')).toBe(0);
    expect(coverColorIndex('Elden Ring')).toBe(1);
    expect(coverColorIndex('Hi-Fi Rush')).toBe(0);
  });

  it('o mesmo título dá sempre o mesmo resultado, em qualquer chamada', () => {
    const first = coverColorIndex('Celeste');

    for (let i = 0; i < 50; i++) {
      expect(coverColorIndex('Celeste')).toBe(first);
    }
  });

  it('ignora caixa e espaços nas pontas: o mesmo jogo em outra plataforma tem a mesma cor', () => {
    expect(coverColorIndex('  CELESTE ')).toBe(coverColorIndex('celeste'));
  });

  it('fica sempre dentro da paleta de 6 cores e usa todas elas', () => {
    const used = new Set<number>();

    for (let i = 0; i < 300; i++) {
      const index = coverColorIndex(`jogo ${i}`);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(COVER_BACKGROUNDS.length);
      used.add(index);
    }

    expect(used.size).toBe(COVER_BACKGROUNDS.length);
  });

  it('coverBackground devolve a classe do token capa-N', () => {
    expect(coverBackground('Celeste')).toBe('bg-capa-3');
    expect(coverBackground('Hades')).toBe('bg-capa-1');
  });

  it('aceita título vazio e emoji sem quebrar', () => {
    expect(coverColorIndex('')).toBeGreaterThanOrEqual(0);
    expect(coverColorIndex('🎮')).toBeLessThan(6);
  });
});

describe('coverInitials (CA-72)', () => {
  it.each([
    ['Hollow Knight', 'HK'],
    ['Celeste', 'C'],
    ['Hi-Fi Rush', 'HR'],
    ['  elden   ring  ', 'ER'],
    ['The Legend of Zelda', 'TL'],
    ['Ícaro', 'Í'],
    ['2048 Deluxe', '2D'],
  ])('%s → %s', (titulo, esperado) => {
    expect(coverInitials(titulo)).toBe(esperado);
  });

  it('ignora palavras sem letra nem número (símbolos, emoji)', () => {
    expect(coverInitials('& Knuckles')).toBe('K');
    expect(coverInitials('🎮 Games')).toBe('G');
  });

  it('sem nenhuma letra ou número, mostra "?"', () => {
    expect(coverInitials('!!!')).toBe('?');
    expect(coverInitials('   ')).toBe('?');
    expect(coverInitials('')).toBe('?');
  });
});
