import { isAxiosError } from 'axios';
import {
  type GameStatus,
  type ItemBiblioteca,
  type PlataformaInfo,
  type PlataformaItemJaVinculadoError,
} from '@checkpoint/shared';
import { errorCode } from '@/features/auth/lib/auth-errors';

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
 * A plataforma de um jogo novo criado a partir de um item da biblioteca: a que o item sugere (`PS5`, `PS4`…) e, sem
 * sugestão, a padrão do cadastro (Steam: `PC`; PlayStation: nenhuma). A pessoa edita no formulário.
 */
export function plataformaDoNovoJogo(item: ItemBiblioteca, plataforma: PlataformaInfo): string {
  return item.plataformaSugerida ?? plataforma.plataformaPadrao ?? '';
}

/**
 * Ligar a um jogo de OUTRA plataforma precisa de confirmação: as horas e as conquistas mostradas são as da
 * plataforma, e a plataforma do jogo não muda. Vazio ou uma das compatíveis do cadastro (Steam: `PC`, `Steam Deck`;
 * PlayStation: `PS1` a `PS5`, `PSP`) não precisa.
 */
export function precisaConfirmarPlataforma(
  doJogo: string | null | undefined,
  plataforma: PlataformaInfo,
): boolean {
  const valor = (doJogo ?? '').trim().toLowerCase();
  return (
    valor !== '' && !plataforma.plataformasCompativeis.some((item) => item.toLowerCase() === valor)
  );
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
