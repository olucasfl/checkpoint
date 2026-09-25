import { ParseUUIDPipe } from '@nestjs/common';
import { badRequestError } from '../../common/errors/api-error';

/**
 * O `:jogoId` de `PUT`/`DELETE .../jogos/:jogoId`: não sendo UUID, 400 `VALIDACAO` no formato da API. Um pipe e
 * não um DTO de parâmetro: o pipe global trataria `jogoId` (que não é campo de formulário) como "campo não
 * permitido". Um UUID sem jogo, ou de outro usuário, é o mesmo 404 do catálogo.
 */
export function jogoIdPipe(): ParseUUIDPipe {
  return new ParseUUIDPipe({
    exceptionFactory: () => badRequestError('Jogo inválido', undefined, 'VALIDACAO'),
  });
}
