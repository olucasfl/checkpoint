import { BadRequestException, ConflictException } from '@nestjs/common';
import { type ApiErrorResponse } from '@checkpoint/shared';

export type ApiFieldErrors = NonNullable<ApiErrorResponse['fields']>;

/**
 * Erros 400/409 no formato ApiErrorResponse: o web usa `fields` para mostrar a mensagem junto do
 * campo certo. Passar o objeto inteiro ao construtor faz o Nest devolvê-lo como corpo da resposta.
 */
function body(statusCode: number, message: string, fields?: ApiFieldErrors): ApiErrorResponse {
  return fields && Object.keys(fields).length > 0
    ? { statusCode, message, fields }
    : { statusCode, message };
}

export function badRequestError(message: string, fields?: ApiFieldErrors): BadRequestException {
  return new BadRequestException(body(400, message, fields));
}

export function conflictError(message: string, fields?: ApiFieldErrors): ConflictException {
  return new ConflictException(body(409, message, fields));
}
