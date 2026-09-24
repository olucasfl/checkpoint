import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { DEFAULT_REGISTRATION_LIMIT_PER_HOUR } from '../../config/env.validation';
import { authErrors } from './auth-errors';

/**
 * Limite por IP nas rotas de auth. Só troca o corpo do 429 pelo formato da API (`code:
 * LIMITE_TENTATIVAS`); o `Retry-After` já é posto pelo `ThrottlerGuard` antes de chegar aqui.
 */
@Injectable()
export class AuthThrottlerGuard extends ThrottlerGuard {
  protected override throwThrottlingException(): Promise<void> {
    throw authErrors.limiteTentativas();
  }
}

/**
 * Registros por hora e por IP: o padrão vem da constante, e a env OPCIONAL só existe para a
 * verificação manual, que cria várias contas sintéticas. Lida a cada request (o boot já validou o valor).
 */
export function registrationLimitPerHour(
  raw: string | undefined = process.env.AUTH_REGISTRATION_LIMIT_PER_HOUR,
): number {
  const value = Number(raw);
  return raw !== undefined && raw.trim() !== '' && Number.isInteger(value) && value >= 1
    ? value
    : DEFAULT_REGISTRATION_LIMIT_PER_HOUR;
}
