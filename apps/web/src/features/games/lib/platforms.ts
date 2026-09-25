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

/** Rótulo do grupo das plataformas favoritas (preferência do /perfil), o primeiro da seleção. */
export const FAVORITAS_LABEL = 'Favoritas';

/**
 * Os grupos da seleção com as favoritas primeiro. Cada favorita SAI do grupo da família dela (sem
 * opção repetida); família que fica vazia some. Favorita fora da lista (não deveria acontecer) é
 * ignorada: a lista é a fonte das opções.
 */
export function groupsWithFavorites(favoritas: readonly string[]): readonly PlatformGroup[] {
  const escolhidas = favoritas.filter((p, i) => isKnownPlatform(p) && favoritas.indexOf(p) === i);
  if (escolhidas.length === 0) {
    return PLATFORM_GROUPS;
  }
  const marcadas = new Set(escolhidas);
  const familias = PLATFORM_GROUPS.map((group) => ({
    label: group.label,
    platforms: group.platforms.filter((p) => !marcadas.has(p)),
  })).filter((group) => group.platforms.length > 0);
  return [{ label: FAVORITAS_LABEL, platforms: escolhidas }, ...familias];
}

/**
 * Plataformas de um jogo que já existe e não estão na lista (cadastradas como texto livre antes,
 * ou direto pela API): mantidas como opção extra para a edição não apagar o valor sem querer.
 */
export function extraPlatform(current: string): string | null {
  const value = current.trim();
  return value !== '' && !isKnownPlatform(value) ? value : null;
}
