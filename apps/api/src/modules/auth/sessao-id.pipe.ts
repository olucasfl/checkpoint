import { ParseUUIDPipe } from '@nestjs/common';
import { authErrors } from './auth-errors';

/**
 * Valida o `:id` de `DELETE /api/auth/sessoes/:id`: não sendo UUID, 400 `VALIDACAO` no formato da API
 * (com `code`). Um pipe e não um DTO de parâmetro: o pipe global trataria `id` (que não é campo de
 * formulário) como "campo não permitido", uma mensagem errada para um id malformado.
 */
export function sessaoIdPipe(): ParseUUIDPipe {
  return new ParseUUIDPipe({ exceptionFactory: () => authErrors.sessaoIdInvalido() });
}
