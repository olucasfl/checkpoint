/**
 * Plataformas oferecidas no formulário: as mais usadas para jogar, sem os ambientes raros. A API
 * continua aceitando texto livre (até 60 caracteres); o web só oferece esta lista. O texto escolhido
 * é o que vai para a API, então a regra de duplicidade (mesmo título e plataforma) usa estes nomes.
 */
export interface PlatformGroup {
  label: string;
  platforms: readonly string[];
}

export const PLATFORM_GROUPS: readonly PlatformGroup[] = [
  { label: 'Computador', platforms: ['PC', 'Steam Deck'] },
  { label: 'PlayStation', platforms: ['PS1', 'PS2', 'PS3', 'PS4', 'PS5', 'PSP'] },
  { label: 'Xbox', platforms: ['Xbox', 'Xbox 360', 'Xbox One', 'Xbox Series X|S'] },
  {
    label: 'Nintendo',
    platforms: [
      'NES',
      'Super Nintendo',
      'Nintendo 64',
      'GameCube',
      'Wii',
      'Wii U',
      'Nintendo Switch',
      'Game Boy Advance',
      'Nintendo DS',
      'Nintendo 3DS',
    ],
  },
  { label: 'Celular', platforms: ['Android', 'iOS'] },
  { label: 'Outros', platforms: ['Mega Drive'] },
];

const KNOWN = new Set(PLATFORM_GROUPS.flatMap((group) => group.platforms));

export function isKnownPlatform(platform: string): boolean {
  return KNOWN.has(platform);
}

/**
 * Plataformas de um jogo que já existe e não estão na lista (cadastradas como texto livre antes,
 * ou direto pela API): mantidas como opção extra para a edição não apagar o valor sem querer.
 */
export function extraPlatform(current: string): string | null {
  const value = current.trim();
  return value !== '' && !isKnownPlatform(value) ? value : null;
}
