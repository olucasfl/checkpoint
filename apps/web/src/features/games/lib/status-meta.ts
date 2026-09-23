import { type GameStatus } from '@checkpoint/shared';

/**
 * Textos, ícones e cores de tela por status. O contrato usa só os códigos (ZERADO, JOGANDO,
 * QUERO_JOGAR); "Quero jogar" existe só aqui, no web. Zerado é ouro (conquista), Jogando é ciano (azul neon) e
 * Quero jogar é vermelho neon. As classes ficam escritas por extenso para o Tailwind achá-las.
 */
export interface StatusMeta {
  /** Singular: selo da linha e botão do formulário ("Quero jogar"). */
  label: string;
  /** Rótulo do painel de contagem ("Zerados"). */
  panelLabel: string;
  icon: string;
  text: string;
  glowText: string;
  border: string;
  tint: string;
  tintStrong: string;
  glowSoft: string;
}

export const STATUS_META: Record<GameStatus, StatusMeta> = {
  ZERADO: {
    label: 'Zerado',
    panelLabel: 'Zerados',
    icon: 'emoji_events',
    text: 'text-ouro',
    glowText: 'glow-text-ouro',
    border: 'border-ouro',
    tint: 'tint-ouro',
    tintStrong: 'tint-ouro-strong',
    glowSoft: 'glow-ouro-soft',
  },
  JOGANDO: {
    label: 'Jogando',
    panelLabel: 'Jogando',
    icon: 'sports_esports',
    text: 'text-ciano',
    glowText: 'glow-text-ciano',
    border: 'border-ciano',
    tint: 'tint-ciano',
    tintStrong: 'tint-ciano-strong',
    glowSoft: 'glow-ciano-soft',
  },
  QUERO_JOGAR: {
    label: 'Quero jogar',
    panelLabel: 'Quero jogar',
    icon: 'bookmark',
    text: 'text-vermelho-neon',
    glowText: 'glow-text-vermelho-neon',
    border: 'border-vermelho-neon',
    tint: 'tint-vermelho-neon',
    tintStrong: 'tint-vermelho-neon-strong',
    glowSoft: 'glow-vermelho-neon-soft',
  },
};

type PlatformIcon = 'computer' | 'videogame_asset' | 'smartphone' | 'sports_esports';

/** Ícone da plataforma pelo nome (PC, Nintendo Switch, PS5, Android...); texto livre antigo também cai aqui. */
export function platformIcon(plataforma: string): PlatformIcon {
  const text = plataforma.toLowerCase();

  if (/\b(pc|windows|mac|macos|linux|steam)\b/.test(text)) {
    return 'computer';
  }
  if (/\b(android|ios|iphone|ipad|celular)\b/.test(text)) {
    return 'smartphone';
  }
  if (/\b(switch|nintendo|wii|3ds|ds|gamecube|nes|snes|gameboy|game boy)\b/.test(text)) {
    return 'videogame_asset';
  }
  return 'sports_esports';
}
