import { chaveDeTitulo } from '@checkpoint/shared';

// `chaveDeTitulo` mora no shared, que não tem runner: o teste fica aqui, como o de `notaMedia`.
describe('chaveDeTitulo (CA-04)', () => {
  it('iguala caixa, acento, ™ e pontuação', () => {
    const chaves = [
      'Pokémon™: Legends – Arceus',
      'pokemon legends arceus',
      '  POKEMON   Legends Arceus ',
    ].map(chaveDeTitulo);

    expect(chaves).toEqual([
      'pokemon legends arceus',
      'pokemon legends arceus',
      'pokemon legends arceus',
    ]);
  });

  it('não confunde títulos diferentes (igualdade, sem aproximação)', () => {
    expect(chaveDeTitulo('Celeste')).not.toBe(chaveDeTitulo('Celeste 64'));
    expect(chaveDeTitulo('The Witcher 3')).not.toBe(chaveDeTitulo('The Witcher 3: Wild Hunt'));
  });

  it('tira ® e © e mantém letras e números de qualquer alfabeto', () => {
    expect(chaveDeTitulo('Sid Meier’s Civilization® VI')).toBe('sid meier s civilization vi');
    expect(chaveDeTitulo('ペルソナ5')).toBe('ペルソナ5');
  });

  it('não apaga marcas que mudam a letra (dakuten do japonês)', () => {
    expect(chaveDeTitulo('ペ')).not.toBe(chaveDeTitulo('ヘ'));
  });

  it('título só de símbolos vira chave vazia', () => {
    expect(chaveDeTitulo('™ ®')).toBe('');
  });
});
