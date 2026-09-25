import { Injectable, Logger } from '@nestjs/common';
import { STEAM_REQUEST_TIMEOUT_MS } from '../integrations.constants';
import {
  PlataformaIndisponivelError,
  PlataformaLimiteError,
  VinculoCanceladoError,
  VinculoRecusadoError,
} from '../providers/plataforma-errors';

export const STEAM_OPENID_ENDPOINT = 'https://steamcommunity.com/openid/login';

const OPENID_NS = 'http://specs.openid.net/auth/2.0';
const IDENTIFIER_SELECT = 'http://specs.openid.net/auth/2.0/identifier_select';

/** O `claimed_id` da Steam: `https://steamcommunity.com/openid/id/<SteamID64>`. */
const CLAIMED_ID_PATTERN = /^https:\/\/steamcommunity\.com\/openid\/id\/(7656\d{13})$/;

/** Campos que a assinatura da Steam TEM de cobrir: sem eles, o resto do retorno pode ser trocado. */
const CAMPOS_ASSINADOS_OBRIGATORIOS = [
  'claimed_id',
  'identity',
  'return_to',
  'op_endpoint',
  'response_nonce',
] as const;

/** O usuário desistiu na tela da Steam (`openid.mode=cancel`). */
export class OpenIdCanceladoError extends VinculoCanceladoError {
  constructor() {
    super('vínculo cancelado na Steam');
  }
}

/** O retorno não é uma prova válida de identidade: adulterado, incompleto ou recusado pela Steam. */
export class OpenIdInvalidoError extends VinculoRecusadoError {
  constructor(motivo: string) {
    super(`retorno do OpenID inválido: ${motivo}`);
  }
}

type Query = Record<string, unknown>;

/**
 * Steam OpenID 2.0, só para VINCULAR (o login do app continua e-mail e senha). Código próprio, sem
 * biblioteca: o SteamID só é aceito depois de a própria Steam confirmar a resposta (`check_authentication`).
 * Isolado atrás de `montarUrl` e `validarRetorno` e mockado nos testes.
 *
 * O `state` que vai na URL de retorno, o SteamID e a assinatura NUNCA vão para o log: o log tem só o nome da
 * chamada e o status.
 */
@Injectable()
export class SteamOpenId {
  private readonly logger = new Logger(SteamOpenId.name);

  /** O endereço da Steam para onde o navegador vai (`checkid_setup`, sem escolher a conta antes). */
  montarUrl(ctx: { returnTo: string; realm: string }): string {
    const params = new URLSearchParams({
      'openid.ns': OPENID_NS,
      'openid.mode': 'checkid_setup',
      'openid.return_to': ctx.returnTo,
      'openid.realm': ctx.realm,
      'openid.identity': IDENTIFIER_SELECT,
      'openid.claimed_id': IDENTIFIER_SELECT,
    });
    return `${STEAM_OPENID_ENDPOINT}?${params.toString()}`;
  }

  /**
   * Confere o retorno e devolve o SteamID64 comprovado. Nenhum parâmetro `openid.*` é confiável antes do
   * último passo: as checagens locais vêm primeiro (e não gastam chamada de rede), e só um retorno que
   * passa nelas vai à Steam. Lança `OpenIdCanceladoError`, `OpenIdInvalidoError`,
   * `PlataformaIndisponivelError` ou `PlataformaLimiteError`.
   */
  async validarRetorno(query: Query, returnToEsperado: string): Promise<string> {
    const openid = this.somenteOpenId(query);

    if (openid['openid.mode'] === 'cancel') {
      throw new OpenIdCanceladoError();
    }
    if (openid['openid.mode'] !== 'id_res') {
      throw new OpenIdInvalidoError('mode');
    }
    if (openid['openid.ns'] !== OPENID_NS) {
      throw new OpenIdInvalidoError('ns');
    }
    if (openid['openid.op_endpoint'] !== STEAM_OPENID_ENDPOINT) {
      throw new OpenIdInvalidoError('op_endpoint');
    }
    // O `return_to` tem de ser IDÊNTICO ao que montamos para este `state`.
    if (openid['openid.return_to'] !== returnToEsperado) {
      throw new OpenIdInvalidoError('return_to');
    }

    const claimedId = openid['openid.claimed_id'] ?? '';
    const steamId = CLAIMED_ID_PATTERN.exec(claimedId)?.[1];
    if (steamId === undefined || openid['openid.identity'] !== claimedId) {
      throw new OpenIdInvalidoError('claimed_id');
    }

    const assinados = (openid['openid.signed'] ?? '').split(',');
    if (!CAMPOS_ASSINADOS_OBRIGATORIOS.every((campo) => assinados.includes(campo))) {
      throw new OpenIdInvalidoError('signed');
    }
    for (const obrigatorio of ['openid.sig', 'openid.assoc_handle', 'openid.response_nonce']) {
      if ((openid[obrigatorio] ?? '') === '') {
        throw new OpenIdInvalidoError('campo ausente');
      }
    }

    await this.confirmarNaSteam(openid);
    return steamId;
  }

  /**
   * Só os `openid.*`, e cada um UMA vez com texto: um parâmetro repetido (array) ou aninhado é tentativa de
   * confundir o que a Steam assinou com o que a API leu.
   */
  private somenteOpenId(query: Query): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [chave, valor] of Object.entries(query)) {
      if (!chave.startsWith('openid.')) {
        continue;
      }
      if (typeof valor !== 'string') {
        throw new OpenIdInvalidoError('parâmetro repetido');
      }
      result[chave] = valor;
    }
    return result;
  }

  /** `POST check_authentication`: a Steam confere a assinatura e invalida o `response_nonce` (barra o replay). */
  private async confirmarNaSteam(openid: Record<string, string>): Promise<void> {
    const body = new URLSearchParams({ ...openid, 'openid.mode': 'check_authentication' });

    let response: Response;
    try {
      response = await fetch(STEAM_OPENID_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
        // Nunca segue um redirecionamento: a resposta vem direto do endpoint fixo da Steam.
        redirect: 'manual',
        signal: AbortSignal.timeout(STEAM_REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      const kind = error instanceof Error ? error.name : 'erro desconhecido';
      this.logger.error(`Steam (check_authentication) sem resposta: ${kind}`);
      throw new PlataformaIndisponivelError();
    }

    if (response.status === 429) {
      this.logger.warn('Steam (check_authentication) respondeu 429');
      throw new PlataformaLimiteError();
    }
    if (!response.ok) {
      this.logger.error(`Steam (check_authentication) respondeu HTTP ${response.status}`);
      throw new PlataformaIndisponivelError();
    }

    // Resposta em texto, uma `chave:valor` por linha. `is_valid` duplicado é ambíguo: recusa.
    const linhas = (await response.text())
      .split('\n')
      .map((linha) => linha.trim())
      .filter((linha) => linha.startsWith('is_valid:'));
    if (linhas.length !== 1 || linhas[0] !== 'is_valid:true') {
      throw new OpenIdInvalidoError('a Steam não confirmou');
    }
  }
}
