import { CanActivate, Injectable, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TokenExpiredError } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { type RequestWithUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../database/prisma.service';
import { authErrors } from './auth-errors';
import { AuthTokensService, type TokenClaims } from './auth-tokens.service';

const BEARER = /^Bearer\s+(\S+)$/i;

/**
 * Guard global (`APP_GUARD`): toda rota exige access token, exceto as marcadas com `@Public()`.
 * Confere também que a sessão do token ainda existe (uma leitura por chave primária): logout, troca de
 * senha e reuso de refresh derrubam o access token dela NA HORA, não só quando ele vence.
 */
@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: AuthTokensService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = BEARER.exec(request.headers.authorization ?? '')?.[1];
    if (!token) {
      throw authErrors.naoAutenticado();
    }

    const claims = await this.verify(token);

    const session = await this.prisma.refreshSession.findUnique({
      where: { id: claims.sid },
      select: { userId: true, expiraEm: true },
    });
    if (!session || session.userId !== claims.sub || session.expiraEm.getTime() <= Date.now()) {
      throw authErrors.sessaoEncerrada();
    }

    request.user = { id: claims.sub, sessionId: claims.sid };
    return true;
  }

  private async verify(token: string): Promise<TokenClaims> {
    let claims: TokenClaims;
    try {
      claims = await this.tokens.verifyAccess(token);
    } catch (error) {
      // O vencimento só é reportado se a assinatura conferiu: um token forjado nunca chega aqui.
      throw error instanceof TokenExpiredError
        ? authErrors.tokenExpirado()
        : authErrors.naoAutenticado();
    }
    if (
      claims.typ !== 'access' ||
      typeof claims.sub !== 'string' ||
      typeof claims.sid !== 'string'
    ) {
      throw authErrors.naoAutenticado();
    }
    return claims;
  }
}
