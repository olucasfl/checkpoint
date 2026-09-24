/**
 * Capa gerada para o jogo sem imagem: uma cor da paleta fixa (capa-1 a capa-6, no @theme) escolhida
 * por hash determinístico do título, e as iniciais. O mesmo título dá sempre a mesma capa. Mora em
 * `shared/` porque o avatar de iniciais do `/perfil` usa a mesma regra com o nome da pessoa.
 */

/** Classes por extenso (o Tailwind precisa achá-las no código). Índice = resultado do hash. */
export const COVER_BACKGROUNDS = [
  'bg-capa-1',
  'bg-capa-2',
  'bg-capa-3',
  'bg-capa-4',
  'bg-capa-5',
  'bg-capa-6',
] as const;

/** Mesma normalização da duplicidade na API: aparado e em minúsculas. */
function normalizeTitle(titulo: string): string {
  return titulo.trim().toLowerCase();
}

/** FNV-1a de 32 bits: simples, estável e bem distribuído para textos curtos. */
function hash(text: string): number {
  let value = 0x811c9dc5;

  for (const char of text) {
    value ^= char.codePointAt(0) ?? 0;
    value = Math.imul(value, 0x01000193);
  }

  return value >>> 0;
}

/** Índice (0 a 5) da cor da capa para um título. */
export function coverColorIndex(titulo: string): number {
  return hash(normalizeTitle(titulo)) % COVER_BACKGROUNDS.length;
}

export function coverBackground(titulo: string): (typeof COVER_BACKGROUNDS)[number] {
  return COVER_BACKGROUNDS[coverColorIndex(titulo)] ?? COVER_BACKGROUNDS[0];
}

/**
 * Primeira letra (ou número) de cada uma das duas primeiras palavras, em maiúsculas. Uma palavra
 * só dá uma letra. Palavras sem letra nem número ("&", emoji) são ignoradas; sem nada, "?".
 */
export function coverInitials(titulo: string): string {
  const initials = titulo
    .trim()
    .split(/\s+/)
    .map((word) => Array.from(word).find((char) => /[\p{L}\p{N}]/u.test(char)))
    .filter((char): char is string => char !== undefined)
    .slice(0, 2)
    .map((char) => char.toUpperCase());

  return initials.length > 0 ? initials.join('') : '?';
}
