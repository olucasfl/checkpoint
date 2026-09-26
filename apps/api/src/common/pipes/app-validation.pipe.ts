import { ValidationPipe, type ValidationError } from '@nestjs/common';
import { type ApiErrorField } from '@checkpoint/shared';
import { badRequestError, type ApiFieldErrors } from '../errors/api-error';

const FIELDS: readonly ApiErrorField[] = [
  'titulo',
  'plataforma',
  'status',
  'gameplay',
  'historia',
  'graficos',
  'trilhaSonora',
  'performance',
  'notas',
  'descricao',
  'nome',
  'email',
  'senha',
  'senhaAtual',
  'novaSenha',
  'busca',
  'limite',
  'nuncaJogados',
  'idExterno',
  'mover',
];

function isApiErrorField(property: string): property is ApiErrorField {
  return (FIELDS as readonly string[]).includes(property);
}

/**
 * Converte os erros do class-validator no formato ApiErrorResponse: uma mensagem por campo em
 * `fields`, e os campos que o DTO não declara (`forbidNonWhitelisted`) listados na `message`.
 */
export function validationErrorsToException(errors: ValidationError[]) {
  const fields: ApiFieldErrors = {};
  const unknownProperties: string[] = [];

  for (const error of errors) {
    const constraints = error.constraints ?? {};

    if ('whitelistValidation' in constraints || !isApiErrorField(error.property)) {
      unknownProperties.push(error.property);
      continue;
    }

    const [firstMessage] = Object.values(constraints);
    if (firstMessage) {
      fields[error.property] = firstMessage;
    }
  }

  const message =
    unknownProperties.length > 0
      ? `Campos não permitidos: ${unknownProperties.join(', ')}`
      : 'Dados inválidos';

  return badRequestError(message, fields, 'VALIDACAO');
}

/**
 * ValidationPipe global (ARCHITECTURE.md §4.1). Fica numa função para o `main.ts` e os testes de DTO
 * usarem exatamente as mesmas opções.
 */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
    exceptionFactory: validationErrorsToException,
  });
}
