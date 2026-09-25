import { isAxiosError } from 'axios';
import { type GameStatus, type PlataformaItemJaVinculadoError } from '@checkpoint/shared';
import { errorCode } from '@/features/auth/lib/auth-errors';

/** Jogo novo criado da biblioteca da Steam começa em "PC" (spec `integracao-plataformas`, Q3). */
export const PLATAFORMA_PADRAO = 'PC';
/** O `titulo` do jogo aceita até 120 caracteres; o da Steam pode ser maior. */
export const TITULO_MAX = 120;

/**
 * O status sugerido para um jogo novo: sem horas = "Quero jogar", com horas = "Jogando". Nunca "Zerado": só a
 * pessoa sabe se terminou o jogo (as conquistas e as horas não provam isso).
 */
export function statusSugerido(minutosJogados: number): GameStatus {
  return minutosJogados > 0 ? 'JOGANDO' : 'QUERO_JOGAR';
}

export function tituloDoItem(titulo: string): string {
  return titulo.trim().slice(0, TITULO_MAX);
}

/**
 * Ligar a um jogo de OUTRA plataforma (PlayStation, Switch…) precisa de confirmação: as horas e as conquistas são
 * as da Steam, e a plataforma do jogo não muda. Vazio ou "PC" não precisa (é o caso comum).
 */
export function precisaConfirmarPlataforma(plataforma: string | null | undefined): boolean {
  const valor = (plataforma ?? '').trim();
  return valor !== '' && valor.toLowerCase() !== PLATAFORMA_PADRAO.toLowerCase();
}

/** O jogo que já tem o item, no 409 `PLATAFORMA_ITEM_JA_VINCULADO` (para oferecer "Mover o vínculo"). */
export function jogoAtualDoErro(
  error: unknown,
): PlataformaItemJaVinculadoError['jogoAtual'] | null {
  if (!isAxiosError(error) || errorCode(error) !== 'PLATAFORMA_ITEM_JA_VINCULADO') {
    return null;
  }
  const data: unknown = error.response?.data;
  const atual = (data as { jogoAtual?: unknown } | undefined)?.jogoAtual;
  if (typeof atual !== 'object' || atual === null) {
    return null;
  }
  const { id, titulo } = atual as Record<string, unknown>;
  return typeof id === 'string' && typeof titulo === 'string' ? { id, titulo } : null;
}
