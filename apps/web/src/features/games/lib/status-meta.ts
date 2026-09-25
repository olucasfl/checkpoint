import { type GameStatus } from '@checkpoint/shared';

/**
 * Textos, ícones e cores de tela por status. O contrato usa só os códigos (ZERADO, JOGANDO,
 * QUERO_JOGAR); "Quero jogar" existe só aqui, no web. Zerado é verde, Jogando é azul claro e Quero jogar é ouro
 * (tokens `status-*`). As classes ficam escritas por extenso para o Tailwind achá-las.
 */
export interface StatusMeta {
  /** Singular: selo da linha e botão do formulário ("Quero jogar"). */
  label: string;
  /** Rótulo do painel de contagem ("Zerados"). */
  panelLabel: string;
  icon: string;
  /** Texto e ícone na cor do status (>= 4,5:1 sobre painel). */
  text: string;
  border: string;
  /** Fundo de 18% do status (chip e botão de status marcado). */
  tint: string;
}

export const STATUS_META: Record<GameStatus, StatusMeta> = {
  ZERADO: {
    label: 'Zerado',
    panelLabel: 'Zerados',
    icon: 'emoji_events',
    text: 'text-status-zerado',
    border: 'border-status-zerado',
    tint: 'tint-status-zerado',
  },
  JOGANDO: {
    label: 'Jogando',
    panelLabel: 'Jogando',
    icon: 'sports_esports',
    text: 'text-status-jogando',
    border: 'border-status-jogando',
    tint: 'tint-status-jogando',
  },
  QUERO_JOGAR: {
    label: 'Quero jogar',
    panelLabel: 'Quero jogar',
    icon: 'bookmark',
    text: 'text-status-quero-jogar',
    border: 'border-status-quero-jogar',
    tint: 'tint-status-quero-jogar',
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
