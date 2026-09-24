import { applyDecorators } from '@nestjs/common';
import { Transform, Type, type TransformFnParams } from 'class-transformer';
import { isEmail, registerDecorator, type ValidationArguments } from 'class-validator';
import {
  normalizeEmail,
  passwordProblem,
  PASSWORD_MAX_BYTES,
  USER_EMAIL_MAX_LENGTH,
  USER_NAME_MAX_LENGTH,
  utf8ByteLength,
} from '@checkpoint/shared';

/** Mensagens de campo da spec autenticacao ("Regras de campo"). */
export const FIELD_MESSAGES = {
  nomeVazio: 'Informe seu nome',
  nomeLongo: `O nome pode ter no máximo ${USER_NAME_MAX_LENGTH} caracteres`,
  email: 'Informe um e-mail válido',
  senhaCurta: 'A senha deve ter pelo menos 8 caracteres',
  senhaLonga: `A senha pode ter no máximo ${PASSWORD_MAX_BYTES} bytes (cerca de ${PASSWORD_MAX_BYTES} letras sem acento)`,
  senhaSoEspacos: 'A senha não pode ser só espaços',
  senhaLoginVazia: 'Informe a senha',
} as const;

/** Cada regra devolve a mensagem do problema, ou `null` se o valor está ok. */
export type FieldProblem = (value: unknown) => string | null;

export const nomeProblem: FieldProblem = (value) => {
  if (typeof value !== 'string' || value.length === 0) {
    return FIELD_MESSAGES.nomeVazio;
  }
  return [...value].length > USER_NAME_MAX_LENGTH ? FIELD_MESSAGES.nomeLongo : null;
};

export const emailProblem: FieldProblem = (value) =>
  typeof value === 'string' && [...value].length <= USER_EMAIL_MAX_LENGTH && isEmail(value)
    ? null
    : FIELD_MESSAGES.email;

/** Senha NOVA (registro): mínimo, máximo em bytes e não só espaços. Nenhuma normalização. */
export const novaSenhaProblem: FieldProblem = (value) => {
  if (typeof value !== 'string') {
    return FIELD_MESSAGES.senhaCurta;
  }
  switch (passwordProblem(value)) {
    case null:
      return null;
    case 'so-espacos':
      return FIELD_MESSAGES.senhaSoEspacos;
    case 'longa':
      return FIELD_MESSAGES.senhaLonga;
    default:
      return FIELD_MESSAGES.senhaCurta;
  }
};

/**
 * Senha do LOGIN: só exige texto não vazio e dentro do teto de bytes. A regra do tamanho mínimo não
 * vale aqui: quem tem uma senha antiga curta não pode ser barrado antes de tentar.
 */
export const senhaLoginProblem: FieldProblem = (value) => {
  if (typeof value !== 'string' || value.length === 0) {
    return FIELD_MESSAGES.senhaLoginVazia;
  }
  return utf8ByteLength(value) > PASSWORD_MAX_BYTES ? FIELD_MESSAGES.senhaLonga : null;
};

/**
 * Liga uma regra a um campo. Um decorator só por campo (em vez de vários `@IsString`/`@MinLength`)
 * garante UMA mensagem determinística: o pipe global fica com a primeira das restrições, e a ordem
 * delas depende de como o class-validator empilha os decorators.
 */
export function Rule(problem: FieldProblem): PropertyDecorator {
  return (target, propertyKey) => {
    registerDecorator({
      name: 'authFieldRule',
      target: target.constructor,
      propertyName: propertyKey as string,
      validator: {
        validate: (value: unknown) => problem(value) === null,
        defaultMessage: (args?: ValidationArguments) => problem(args?.value) ?? '',
      },
    });
  };
}

/** E-mail normalizado (trim + minúsculas) ANTES de validar; outro tipo passa cru e falha na regra. */
export const NormalizedEmail = () =>
  applyDecorators(
    // Sem conversão implícita (ver `common/dto/transforms.ts`).
    Type(() => Object),
    Transform(({ obj, key }: TransformFnParams) => {
      const raw: unknown = obj[key];
      return typeof raw === 'string' ? normalizeEmail(raw) : raw;
    }),
  );
