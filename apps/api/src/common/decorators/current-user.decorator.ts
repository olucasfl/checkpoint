import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { type Request } from 'express';
import { apiError } from '../errors/api-error';

/** Quem está logado, como o guard global o anexa à request. */
export interface AuthenticatedUser {
  id: string;
  /** `sid` do access token: a linha de `RefreshSession` deste dispositivo. */
  sessionId: string;
}

export type RequestWithUser = Request & { user?: AuthenticatedUser };

/** O usuário da request. Só existe em rota protegida; numa rota `@Public()` não há o que entregar. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const user = context.switchToHttp().getRequest<RequestWithUser>().user;
    if (!user) {
      throw apiError(401, 'AUTH_NAO_AUTENTICADO', 'Entre para continuar.');
    }
    return user;
  },
);
