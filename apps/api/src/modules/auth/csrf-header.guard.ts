import { CanActivate, Injectable, type ExecutionContext } from '@nestjs/common';
import { type Request } from 'express';
import { CSRF_HEADER } from '@checkpoint/shared';
import { authErrors } from './auth-errors';

/**
 * `refresh` e `logout` leem o cookie de sessão, então exigem um cabeçalho próprio. Um cabeçalho fora
 * da lista simples força o preflight de CORS, que só a origem permitida passa: um formulário de outro
 * site não consegue enviá-lo. Vale mesmo com `SameSite=Lax`, porque em dev outros apps em `localhost`
 * (outras portas) são o MESMO site e mandariam o cookie.
 */
@Injectable()
export class CsrfHeaderGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (request.header(CSRF_HEADER) !== '1') {
      throw authErrors.origemInvalida();
    }
    return true;
  }
}
