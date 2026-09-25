import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, TokenExpiredError } from '@nestjs/jwt';
import { type Provedor } from '@checkpoint/shared';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { type EnvironmentVariables } from '../../../config/env.validation';
import { VINCULO_STATE_ISSUER, VINCULO_STATE_TTL_SECONDS } from '../integrations.constants';

const ALGORITHM = 'HS256';

interface VinculoClaims {
  sub: string;
  typ: 'vinculo';
  prov: Provedor;
  nonce: string;
}

/** O `state` não confere: adulterado, de outro tipo, de outro provedor ou assinado por outro segredo. */
export class VinculoInvalidoError extends Error {
  constructor() {
    super('state do vínculo inválido');
    this.name = 'VinculoInvalidoError';
  }
}

/** O `state` é legítimo, mas passou dos 10 minutos. */
export class VinculoExpiradoError extends Error {
  constructor() {
    super('state do vínculo expirado');
    this.name = 'VinculoExpiradoError';
  }
}

/**
 * O `state` do vínculo (spec `integracao-plataformas`, "Fluxo do vínculo"): um JWT curto que diz QUEM
 * iniciou o vínculo, já que o retorno da Steam é um GET do navegador sem `Authorization`. Sozinho ele não
 * basta: o `nonce` dele também vai num cookie `HttpOnly`, e o retorno só vale se os dois baterem, senão o
 * link de outra pessoa, aberto no navegador da vítima, vincularia a Steam da vítima à conta do atacante.
 *
 * Reaproveita o `JWT_ACCESS_SECRET` (sem segredo novo), então NADA aqui assina um token de acesso: o emissor
 * é próprio (`checkpoint-api:vinculo`) e o `typ` é `vinculo`. Os dois sentidos são travados por teste: o
 * guard global recusa um `state` como access token, e este serviço recusa um access token (ou refresh
 * token) como `state`.
 */
@Injectable()
export class VinculoStateService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  /** O `state` (vai na URL de retorno) e o `nonce` (vai no cookie). */
  async emitir(userId: string, provedor: Provedor): Promise<{ state: string; nonce: string }> {
    const nonce = randomBytes(32).toString('base64url');
    const state = await this.jwt.signAsync(
      { sub: userId, typ: 'vinculo', prov: provedor, nonce },
      {
        secret: this.secret(),
        expiresIn: VINCULO_STATE_TTL_SECONDS,
        issuer: VINCULO_STATE_ISSUER,
        algorithm: ALGORITHM,
      },
    );
    return { state, nonce };
  }

  /** Lança `VinculoExpiradoError` ou `VinculoInvalidoError`. O provedor do `state` tem que ser o da rota. */
  async verificar(state: string, provedor: Provedor): Promise<{ userId: string; nonce: string }> {
    let claims: Partial<VinculoClaims>;
    try {
      claims = await this.jwt.verifyAsync<Partial<VinculoClaims>>(state, {
        secret: this.secret(),
        issuer: VINCULO_STATE_ISSUER,
        algorithms: [ALGORITHM],
      });
    } catch (error) {
      // O vencimento só é reportado se a assinatura conferiu: um `state` forjado nunca chega a "expirado".
      throw error instanceof TokenExpiredError
        ? new VinculoExpiradoError()
        : new VinculoInvalidoError();
    }
    if (
      claims.typ !== 'vinculo' ||
      claims.prov !== provedor ||
      typeof claims.sub !== 'string' ||
      claims.sub === '' ||
      typeof claims.nonce !== 'string' ||
      claims.nonce === ''
    ) {
      throw new VinculoInvalidoError();
    }
    return { userId: claims.sub, nonce: claims.nonce };
  }

  /**
   * O nonce do cookie tem que ser igual ao do `state`. Comparação em tempo constante (sobre o hash dos dois,
   * que tem tamanho fixo, porque `timingSafeEqual` exige buffers do mesmo tamanho). Sem cookie, não confere.
   */
  static nonceConfere(doCookie: string | undefined, doState: string): boolean {
    if (typeof doCookie !== 'string' || doCookie === '' || doState === '') {
      return false;
    }
    const hash = (valor: string): Buffer => createHash('sha256').update(valor).digest();
    return timingSafeEqual(hash(doCookie), hash(doState));
  }

  private secret(): string {
    return this.config.get('JWT_ACCESS_SECRET', { infer: true });
  }
}
