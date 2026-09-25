import { type ApiErrorCode } from '@checkpoint/shared';

/**
 * Erros de domínio das integrações. Não são `HttpException`: o cliente da plataforma e os providers
 * não conhecem HTTP. Quem mapeia para a resposta (502, 409…) é o service/controller, pelo `code`
 * estável, que o web transforma em texto (`ApiErrorCode` do shared).
 */
export class PlataformaError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** Timeout, 5xx, chave recusada (401/403), resposta sem JSON ou em formato que não é o esperado. */
export class PlataformaIndisponivelError extends PlataformaError {
  constructor(message = 'A plataforma não respondeu como esperado') {
    super('PLATAFORMA_INDISPONIVEL', message);
  }
}

/** A plataforma respondeu 429: muitas consultas com a mesma chave. */
export class PlataformaLimiteError extends PlataformaError {
  constructor(message = 'A plataforma limitou as consultas') {
    super('PLATAFORMA_LIMITE', message);
  }
}

/** Perfil (ou "detalhes do jogo") privado: a plataforma não entrega os dados sem o usuário torná-los públicos. */
export class PerfilPrivadoError extends PlataformaError {
  constructor(message = 'O perfil na plataforma está privado') {
    super('PLATAFORMA_PERFIL_PRIVADO', message);
  }
}

/** O item (na Steam, o appid) não está na biblioteca do usuário: só se liga o que ele tem. */
export class PlataformaItemNaoEncontradoError extends PlataformaError {
  constructor(message = 'O item não está na biblioteca do usuário') {
    super('PLATAFORMA_ITEM_NAO_ENCONTRADO', message);
  }
}

/**
 * Identificador externo (SteamID, appid) fora do formato. É erro de VALIDAÇÃO (na rota vira 400), nunca
 * "perfil privado": a Steam responde 400 em HTML a um ID malformado, então o formato é conferido antes.
 */
export class IdExternoInvalidoError extends Error {
  constructor(
    readonly campo: 'steamId' | 'appId',
    message: string,
  ) {
    super(message);
    this.name = 'IdExternoInvalidoError';
  }
}

/** O `:provedor` da rota não é um provedor que a API conheça. */
export class ProvedorNaoSuportadoError extends Error {
  constructor(provedor: string) {
    super(`Provedor não suportado: ${provedor}`);
    this.name = 'ProvedorNaoSuportadoError';
  }
}

/** O usuário desistiu do vínculo na tela da plataforma. */
export class VinculoCanceladoError extends Error {
  constructor(message = 'vínculo cancelado na plataforma') {
    super(message);
    this.name = new.target.name;
  }
}

/**
 * O retorno do vínculo não é uma prova válida de identidade (adulterado, incompleto ou recusado pela
 * plataforma). Não é falha da plataforma: quem chama trata como retorno inválido, não como indisponível.
 */
export class VinculoRecusadoError extends Error {
  constructor(message = 'retorno do vínculo recusado') {
    super(message);
    this.name = new.target.name;
  }
}
