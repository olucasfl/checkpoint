import {
  statusAllowsRating,
  type CreateGameRequest,
  type Game,
  type GameStatus,
} from '@checkpoint/shared';

/** Estado do formulário: tudo texto, como nos inputs. */
export interface GameFormValues {
  titulo: string;
  plataforma: string;
  status: GameStatus;
  /** "" = sem nota. */
  nota: string;
}

export const EMPTY_FORM_VALUES: GameFormValues = {
  titulo: '',
  plataforma: '',
  status: 'QUERO_JOGAR',
  nota: '',
};

export function valuesFromGame(game: Game): GameFormValues {
  return {
    titulo: game.titulo,
    plataforma: game.plataforma ?? '',
    status: game.status,
    nota: game.nota === null ? '' : String(game.nota),
  };
}

/** Troca o status. Em "Quero jogar" a nota não existe: o campo é bloqueado e limpo (CA-43). */
export function withStatus(values: GameFormValues, status: GameStatus): GameFormValues {
  return { ...values, status, nota: statusAllowsRating(status) ? values.nota : '' };
}

/**
 * Corpo enviado à API. Sempre completo, também na edição: com status "Quero jogar" vai
 * `nota: null` explícito, senão o PATCH seria rejeitado num jogo que já tinha nota (a API valida o
 * estado final e nunca apaga a nota por conta própria).
 */
export function toGameRequest(values: GameFormValues): CreateGameRequest {
  const plataforma = values.plataforma.trim();
  const nota =
    statusAllowsRating(values.status) && values.nota.trim() !== '' ? Number(values.nota) : null;

  return {
    titulo: values.titulo.trim(),
    status: values.status,
    plataforma: plataforma === '' ? null : plataforma,
    nota: nota === null || Number.isNaN(nota) ? null : nota,
  };
}
