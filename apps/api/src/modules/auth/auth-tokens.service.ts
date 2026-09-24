import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { type EnvironmentVariables } from '../../config/env.validation';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
  TOKEN_ISSUER,
} from './auth.constants';

export interface TokenClaims {
  sub: string;
  sid: string;
  typ: 'access' | 'refresh';
}

const ALGORITHM = 'HS256';

/**
 * Assina e verifica os dois tokens. Segredos SEPARADOS: um refresh token apresentado como access
 * (ou o contrário) falha na assinatura, sem depender de ninguém lembrar de conferir o `typ`.
 */
@Injectable()
export class AuthTokensService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  signAccess(userId: string, sessionId: string): Promise<string> {
    return this.jwt.signAsync(
      { sub: userId, sid: sessionId, typ: 'access' },
      {
        secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
        issuer: TOKEN_ISSUER,
        algorithm: ALGORITHM,
      },
    );
  }

  /** `jti` aleatório: dois refresh tokens da mesma sessão no mesmo segundo não podem ser iguais. */
  signRefresh(userId: string, sessionId: string): Promise<string> {
    return this.jwt.signAsync(
      { sub: userId, sid: sessionId, typ: 'refresh', jti: randomUUID() },
      {
        secret: this.config.get('JWT_REFRESH_SECRET', { infer: true }),
        expiresIn: REFRESH_TOKEN_TTL_SECONDS,
        issuer: TOKEN_ISSUER,
        algorithm: ALGORITHM,
      },
    );
  }

  /** Lança `TokenExpiredError` (vencido) ou `JsonWebTokenError` (assinatura, formato, emissor). */
  verifyAccess(token: string): Promise<TokenClaims> {
    return this.jwt.verifyAsync<TokenClaims>(token, {
      secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
      issuer: TOKEN_ISSUER,
      algorithms: [ALGORITHM],
    });
  }

  /** `ignoreExpiration` só para o logout: sair com o cookie vencido também deve funcionar. */
  verifyRefresh(token: string, options: { ignoreExpiration?: boolean } = {}): Promise<TokenClaims> {
    return this.jwt.verifyAsync<TokenClaims>(token, {
      secret: this.config.get('JWT_REFRESH_SECRET', { infer: true }),
      issuer: TOKEN_ISSUER,
      algorithms: [ALGORITHM],
      ignoreExpiration: options.ignoreExpiration ?? false,
    });
  }
}
