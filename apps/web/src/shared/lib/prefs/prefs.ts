import { GAME_STATUS, type GameStatus } from '@checkpoint/shared';
import { defineKey } from '@/shared/lib/storage/keys';

/** As preferências deste aparelho (spec perfil, etapa 3). Nunca vão para a API. */
export const DESTAQUES = ['magenta', 'violeta', 'azul', 'laranja'] as const;
export type Destaque = (typeof DESTAQUES)[number];

/** Na ordem dos botões de filtro do catálogo. */
export const FILTROS_INICIAIS = ['TODOS', 'JOGANDO', 'QUERO_JOGAR', 'ZERADO'] as const;
export type FiltroInicial = GameStatus | 'TODOS';

export const DENSIDADES = ['confortavel', 'compacta'] as const;
export type Densidade = (typeof DENSIDADES)[number];

export const EFEITOS = ['completos', 'reduzidos'] as const;
export type Efeitos = (typeof EFEITOS)[number];

export const MAX_FAVORITAS = 8;

export interface Prefs {
  destaque: Destaque;
  filtroInicial: FiltroInicial;
  densidade: Densidade;
  efeitos: Efeitos;
  /** Nomes da lista de plataformas do catálogo, na ordem em que foram marcadas. */
  plataformasFavoritas: readonly string[];
}

export const PREFS_PADRAO: Prefs = {
  destaque: 'magenta',
  filtroInicial: 'TODOS',
  densidade: 'confortavel',
  efeitos: 'completos',
  plataformasFavoritas: [],
};

const umDe = <T extends string>(lista: readonly T[], valor: unknown): valor is T =>
  typeof valor === 'string' && (lista as readonly string[]).includes(valor);

const isFavoritas = (valor: unknown): valor is readonly string[] =>
  Array.isArray(valor) &&
  valor.length <= MAX_FAVORITAS &&
  valor.every((p) => typeof p === 'string' && p.length > 0 && p.length <= 60) &&
  new Set(valor).size === valor.length;

/** Uma entrada inteira: com um campo inválido, a entrada toda volta ao padrão. */
export function isPrefs(valor: unknown): valor is Prefs {
  if (typeof valor !== 'object' || valor === null) {
    return false;
  }
  const v = valor as Record<string, unknown>;
  return (
    umDe(DESTAQUES, v.destaque) &&
    umDe(['TODOS', ...GAME_STATUS] as const, v.filtroInicial) &&
    umDe(DENSIDADES, v.densidade) &&
    umDe(EFEITOS, v.efeitos) &&
    isFavoritas(v.plataformasFavoritas)
  );
}

/**
 * O que fica gravado: as preferências POR USUÁRIO neste navegador (quem entrar depois tem as suas) e
 * quem usou por último, para aplicar a cor e os efeitos antes do primeiro render, sem piscar.
 */
export interface PrefsGuardadas {
  ultimoUsuario: string | null;
  /** Validadas uma a uma na leitura (`prefsDoUsuario`): uma entrada ruim não apaga as dos outros. */
  porUsuario: Record<string, unknown>;
}

function isPrefsGuardadas(valor: unknown): valor is PrefsGuardadas {
  if (typeof valor !== 'object' || valor === null) {
    return false;
  }
  const { ultimoUsuario, porUsuario } = valor as Record<string, unknown>;
  return (
    (ultimoUsuario === null || typeof ultimoUsuario === 'string') &&
    typeof porUsuario === 'object' &&
    porUsuario !== null &&
    !Array.isArray(porUsuario)
  );
}

/** Escopo `dispositivo`: sobrevive ao logout (a pessoa não reconfigura tudo a cada login). */
export const PREFS = defineKey<PrefsGuardadas>({
  nome: 'prefs',
  escopo: 'dispositivo',
  padrao: { ultimoUsuario: null, porUsuario: {} },
  validar: isPrefsGuardadas,
});

/** As preferências de um usuário; sem entrada, ou com entrada inválida, os padrões. */
export function prefsDoUsuario(guardadas: PrefsGuardadas, userId: string | null): Prefs {
  const entrada = userId === null ? undefined : guardadas.porUsuario[userId];
  return isPrefs(entrada) ? entrada : PREFS_PADRAO;
}
