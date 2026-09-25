import { ArgumentsHost, Catch, type ExceptionFilter, type HttpException } from '@nestjs/common';
import { type Response } from 'express';
import { apiError, badRequestError } from '../../common/errors/api-error';
import {
  IdExternoInvalidoError,
  PerfilPrivadoError,
  PlataformaError,
  PlataformaIndisponivelError,
  PlataformaItemNaoEncontradoError,
  PlataformaLimiteError,
  ProvedorNaoSuportadoError,
} from './providers/plataforma-errors';

/** Os erros de negócio das rotas de integração, um por `code` estável (o web mostra o texto pelo `code`). */
export const integracaoErrors = {
  naoVinculada: () =>
    apiError(409, 'PLATAFORMA_NAO_VINCULADA', 'Vincule sua conta na plataforma para continuar.'),
  jaVinculada: () =>
    apiError(
      409,
      'PLATAFORMA_JA_VINCULADA',
      'Você já tem outra conta vinculada nesta plataforma. Desvincule-a antes.',
    ),
};

/**
 * Domínio → HTTP. Falha da plataforma é **502**, nunca 500 (o catálogo e o resto do app seguem de pé); perfil
 * privado é 409 (a pessoa pode resolver); ID malformado e provedor desconhecido são validação (400). As
 * mensagens são fixas: nada do que a Steam respondeu vai para o corpo.
 */
export function plataformaHttpError(error: unknown): HttpException | null {
  if (error instanceof PerfilPrivadoError) {
    return apiError(409, 'PLATAFORMA_PERFIL_PRIVADO', 'O perfil na plataforma está privado.');
  }
  if (error instanceof PlataformaItemNaoEncontradoError) {
    return apiError(404, 'PLATAFORMA_ITEM_NAO_ENCONTRADO', 'Esse jogo não está na sua biblioteca.');
  }
  if (error instanceof PlataformaLimiteError) {
    return apiError(
      502,
      'PLATAFORMA_LIMITE',
      'Muitas consultas à plataforma. Tente de novo em alguns minutos.',
    );
  }
  if (error instanceof PlataformaIndisponivelError || error instanceof PlataformaError) {
    return apiError(
      502,
      'PLATAFORMA_INDISPONIVEL',
      'Não foi possível falar com a plataforma agora. Tente de novo.',
    );
  }
  if (error instanceof IdExternoInvalidoError) {
    return badRequestError('Identificador inválido', undefined, 'VALIDACAO');
  }
  if (error instanceof ProvedorNaoSuportadoError) {
    return badRequestError('Provedor desconhecido', undefined, 'VALIDACAO');
  }
  return null;
}

/** Aplica `plataformaHttpError` às rotas de integração: o service lança erro de domínio, o filtro responde. */
@Catch(PlataformaError, IdExternoInvalidoError, ProvedorNaoSuportadoError)
export class PlataformaExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = plataformaHttpError(exception);
    const response = host.switchToHttp().getResponse<Response>();
    if (!http) {
      // Não deveria acontecer (o @Catch só pega estes tipos), mas nunca devolve o erro cru.
      response.status(500).json({ statusCode: 500, message: 'Erro interno' });
      return;
    }
    response.status(http.getStatus()).json(http.getResponse());
  }
}
