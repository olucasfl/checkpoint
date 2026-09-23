import { describe, expect, it } from 'vitest';
import { extraPlatform, isKnownPlatform, PLATFORM_GROUPS } from './platforms';
import { platformIcon } from './status-meta';

const ALL = PLATFORM_GROUPS.flatMap((group) => group.platforms);

describe('lista de plataformas do formulário', () => {
  it.each([
    'PC',
    'Nintendo 64',
    'Nintendo Switch',
    'PS3',
    'PS4',
    'PS5',
    'Xbox 360',
    'Xbox One',
    'Xbox Series X|S',
    'Super Nintendo',
    'Android',
    'iOS',
  ])('inclui %s, entre as mais usadas', (platform) => {
    expect(ALL).toContain(platform);
  });

  it('não tem repetição e cada nome cabe no limite de 60 caracteres da API', () => {
    expect(new Set(ALL).size).toBe(ALL.length);
    expect(ALL.every((platform) => platform.length <= 60)).toBe(true);
  });

  it('agrupa por família e nenhum grupo fica vazio', () => {
    expect(PLATFORM_GROUPS.map((group) => group.label)).toEqual([
      'Computador',
      'PlayStation',
      'Xbox',
      'Nintendo',
      'Celular',
      'Outros',
    ]);
    expect(PLATFORM_GROUPS.every((group) => group.platforms.length > 0)).toBe(true);
  });
});

describe('extraPlatform — não apaga o valor antigo na edição', () => {
  it('plataforma da lista não vira opção extra', () => {
    expect(isKnownPlatform('PS5')).toBe(true);
    expect(extraPlatform('PS5')).toBeNull();
  });

  it('texto livre cadastrado antes vira opção extra, aparado', () => {
    expect(extraPlatform('  Atari 2600 ')).toBe('Atari 2600');
  });

  it('vazio não vira opção', () => {
    expect(extraPlatform('')).toBeNull();
    expect(extraPlatform('   ')).toBeNull();
  });
});

describe('platformIcon', () => {
  it.each([
    ['PC', 'computer'],
    ['Steam Deck', 'computer'],
    ['Nintendo Switch', 'videogame_asset'],
    ['Nintendo 64', 'videogame_asset'],
    ['GameCube', 'videogame_asset'],
    ['Super Nintendo', 'videogame_asset'],
    ['Nintendo DS', 'videogame_asset'],
    ['Android', 'smartphone'],
    ['iOS', 'smartphone'],
    ['PS5', 'sports_esports'],
    ['Xbox 360', 'sports_esports'],
    ['Mega Drive', 'sports_esports'],
  ])('%s → %s', (platform, icon) => {
    expect(platformIcon(platform)).toBe(icon);
  });

  it('todas as plataformas da lista têm um ícone', () => {
    expect(ALL.every((platform) => platformIcon(platform).length > 0)).toBe(true);
  });
});
