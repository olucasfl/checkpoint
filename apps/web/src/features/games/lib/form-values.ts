import {
  GAME_RATING_CRITERIA,
  GAME_RATING_KEYS,
  notaMedia,
  statusAllowsRating,
  type CreateGameRequest,
  type Game,
  type GameRatingKey,
  type GameStatus,
} from '@checkpoint/shared';
import { parseRatingInput, ratingErrorText, ratingToInput } from './rating-input';

/** Uma nota por critério, como texto de input: "" = sem nota (diferente de "0", que é uma nota). */
export type RatingTexts = Record<GameRatingKey, string>;

/** Estado do formulário: tudo texto, como nos inputs. */
export interface GameFormValues {
  titulo: string;
  plataforma: string;
  status: GameStatus;
  notas: RatingTexts;
  descricao: string;
}

export const EMPTY_RATING_TEXTS: RatingTexts = {
  gameplay: '',
  historia: '',
  graficos: '',
  trilhaSonora: '',
  performance: '',
};

export const EMPTY_FORM_VALUES: GameFormValues = {
  titulo: '',
  plataforma: '',
  status: 'QUERO_JOGAR',
  notas: EMPTY_RATING_TEXTS,
  descricao: '',
};

export function valuesFromGame(game: Game): GameFormValues {
  const notas = { ...EMPTY_RATING_TEXTS };
  for (const chave of GAME_RATING_KEYS) {
    const nota = game.notas[chave];
    notas[chave] = nota === null ? '' : ratingToInput(nota);
  }
  return {
    titulo: game.titulo,
    plataforma: game.plataforma ?? '',
    status: game.status,
    notas,
    descricao: game.descricao ?? '',
  };
}

/**
 * Troca o status. Em "Quero jogar" a seção Avaliação some, mas as notas digitadas ficam no estado (voltar
 * para Zerado ou Jogando as recupera): quem as apaga é o envio, com `null` explícito em cada critério.
 */
export function withStatus(values: GameFormValues, status: GameStatus): GameFormValues {
  return { ...values, status };
}

/** Alguma nota digitada (válida ou não)? Serve ao aviso de "as notas serão apagadas" em Quero jogar. */
export function hasRatingText(values: GameFormValues): boolean {
  return GAME_RATING_KEYS.some((chave) => values.notas[chave].trim() !== '');
}

/** Os erros de digitação por critério, para avisar antes de enviar. Em "Quero jogar" não há nota a validar. */
export function ratingErrors(values: GameFormValues): Partial<Record<GameRatingKey, string>> {
  const errors: Partial<Record<GameRatingKey, string>> = {};
  if (!statusAllowsRating(values.status)) {
    return errors;
  }
  for (const { chave, rotulo } of GAME_RATING_CRITERIA) {
    if (parseRatingInput(values.notas[chave]).kind === 'invalido') {
      errors[chave] = ratingErrorText(rotulo);
    }
  }
  return errors;
}

/** A nota de um critério como número, ou `null` (vazio, inválido ou sem nota permitida pelo status). */
function ratingValue(values: GameFormValues, chave: GameRatingKey): number | null {
  if (!statusAllowsRating(values.status)) {
    return null;
  }
  const parsed = parseRatingInput(values.notas[chave]);
  return parsed.kind === 'ok' ? parsed.valor : null;
}

/** A média ao vivo do que já foi preenchido (a mesma função da API); `null` sem nenhum critério. */
export function mediaOf(values: GameFormValues): number | null {
  const notas: Partial<Record<GameRatingKey, number | null>> = {};
  for (const chave of GAME_RATING_KEYS) {
    notas[chave] = ratingValue(values, chave);
  }
  return notaMedia(notas);
}

/**
 * Corpo enviado à API. Sempre completo, também na edição: com status "Quero jogar" vai `null` em cada
 * critério, explícito, senão o PATCH seria rejeitado num jogo que já tinha nota (a API valida o estado
 * final e nunca apaga nota por conta própria). Os campos vêm sempre: a API só exige ao menos um critério
 * de um Zerado quando o VALOR muda, então o corpo completo não reabre o bloqueio.
 */
export function toGameRequest(values: GameFormValues): CreateGameRequest {
  const plataforma = values.plataforma.trim();
  const descricao = values.descricao.trim();

  return {
    titulo: values.titulo.trim(),
    status: values.status,
    plataforma: plataforma === '' ? null : plataforma,
    gameplay: ratingValue(values, 'gameplay'),
    historia: ratingValue(values, 'historia'),
    graficos: ratingValue(values, 'graficos'),
    trilhaSonora: ratingValue(values, 'trilhaSonora'),
    performance: ratingValue(values, 'performance'),
    descricao: descricao === '' ? null : values.descricao,
  };
}
