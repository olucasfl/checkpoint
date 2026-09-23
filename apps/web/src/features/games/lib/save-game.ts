import { type Game } from '@checkpoint/shared';
import { gamesApi, type GamesApi } from '../api/games-api';
import { describeError, type FormError } from './api-error';
import { toGameRequest, type GameFormValues } from './form-values';

/** O que fazer com a capa ao salvar: nada, enviar um arquivo novo ou remover a atual. */
export type CoverChange = { kind: 'keep' } | { kind: 'upload'; file: File } | { kind: 'remove' };

export interface SaveGameInput {
  /** Presente ao editar; ausente ao criar. */
  gameId?: string;
  values: GameFormValues;
  cover: CoverChange;
}

export interface SaveGameResult {
  /** O jogo já salvo, com a capa mais recente que o servidor confirmou. */
  game: Game;
  /** Erro só da capa: o jogo FOI salvo (a lista deve refletir isso). `null` = tudo certo. */
  coverError: FormError | null;
}

/**
 * Salva o jogo e SÓ DEPOIS trata a capa (spec, "Salvar com capa"). Se o jogo falha, a exceção sobe
 * e nada foi salvo. Se o jogo salva e a capa falha, NÃO lança: devolve o jogo salvo e o erro da
 * capa, para o formulário continuar aberto editando aquele jogo (o próximo Salvar será PATCH, não
 * POST, e não gera 409 de duplicata).
 */
export async function saveGame(
  { gameId, values, cover }: SaveGameInput,
  api: GamesApi = gamesApi,
): Promise<SaveGameResult> {
  const body = toGameRequest(values);
  let game = gameId ? await api.update(gameId, body) : await api.create(body);

  try {
    if (cover.kind === 'upload') {
      game = await api.uploadCover(game.id, cover.file);
    } else if (cover.kind === 'remove' && game.capaUrl !== null) {
      game = await api.removeCover(game.id);
    }
  } catch (error) {
    return { game, coverError: describeError(error) };
  }

  return { game, coverError: null };
}
