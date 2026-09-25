import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { type RequestWithUser } from '../../common/decorators/current-user.decorator';
import { authErrors } from '../auth/auth-errors';

/**
 * Limite das rotas de integração POR USUÁRIO, não por IP: a chave é o `id` de quem está logado (o guard
 * global de autenticação roda antes e o anexa à request). Assim o limite não depende do `trust proxy`, e
 * duas pessoas atrás do mesmo IP não dividem cota. Cada rota tem contador próprio (o throttler separa por
 * controller e handler). 429 com `code: LIMITE_TENTATIVAS` e `Retry-After`, como o resto da API.
 *
 * A rota de retorno do OpenID é pública (sem usuário): usa `@SkipThrottle()`, porque quem a protege é o `state`
 * assinado, o cookie e a confirmação da Steam.
 */
@Injectable()
export class IntegrationsThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(req: Record<string, unknown>): Promise<string> {
    const userId = (req as unknown as RequestWithUser).user?.id;
    // Sem usuário só acontece se o guard global for removido por engano: cai num contador que barra tudo.
    return Promise.resolve(userId ? `usuario:${userId}` : 'sem-usuario');
  }

  protected override throwThrottlingException(): Promise<void> {
    throw authErrors.limiteTentativas();
  }
}
