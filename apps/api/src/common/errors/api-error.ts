import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  HttpException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { type ApiErrorCode, type ApiErrorResponse } from '@checkpoint/shared';

export type ApiFieldErrors = NonNullable<ApiErrorResponse['fields']>;

/**
 * Erros no formato ApiErrorResponse: o web usa `fields` para mostrar a mensagem junto do campo
 * certo. Passar o objeto inteiro ao construtor faz o Nest devolvê-lo como corpo da resposta.
 */
function body(
  statusCode: number,
  message: string,
  fields?: ApiFieldErrors,
  code?: ApiErrorCode,
): ApiErrorResponse {
  return {
    statusCode,
    ...(code ? { code } : {}),
    message,
    ...(fields && Object.keys(fields).length > 0 ? { fields } : {}),
  };
}

/**
 * Erro com `code` estável (rotas de autenticação). O web mostra o texto pelo `code`, nunca pela
 * `message`.
 */
export function apiError(
  statusCode: number,
  code: ApiErrorCode,
  message: string,
  fields?: ApiFieldErrors,
): HttpException {
  return new HttpException(body(statusCode, message, fields, code), statusCode);
}

export function badRequestError(
  message: string,
  fields?: ApiFieldErrors,
  code?: ApiErrorCode,
): BadRequestException {
  return new BadRequestException(body(400, message, fields, code));
}

export function conflictError(message: string, fields?: ApiFieldErrors): ConflictException {
  return new ConflictException(body(409, message, fields));
}

export function payloadTooLargeError(
  message: string,
  fields?: ApiFieldErrors,
): PayloadTooLargeException {
  return new PayloadTooLargeException(body(413, message, fields));
}

export function badGatewayError(message: string, fields?: ApiFieldErrors): BadGatewayException {
  return new BadGatewayException(body(502, message, fields));
}
