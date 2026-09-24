import {
  PASSWORD_MAX_BYTES,
  USER_EMAIL_MAX_LENGTH,
  USER_NAME_MAX_LENGTH,
  passwordProblem,
  utf8ByteLength,
} from '@checkpoint/shared';

/**
 * As mesmas regras da API, para o formulário avisar antes de enviar (comodidade). A API é a
 * autoridade: o que passar aqui e ela recusar volta em `fields`.
 */
export const FIELD_TEXT = {
  nomeVazio: 'Informe seu nome',
  nomeLongo: `O nome pode ter no máximo ${USER_NAME_MAX_LENGTH} caracteres`,
  email: 'Informe um e-mail válido',
  senhaCurta: 'A senha deve ter pelo menos 8 caracteres',
  senhaLonga: `A senha pode ter no máximo ${PASSWORD_MAX_BYTES} bytes (cerca de ${PASSWORD_MAX_BYTES} letras sem acento)`,
  senhaSoEspacos: 'A senha não pode ser só espaços',
  senhaLoginVazia: 'Informe a senha',
  senhaAtualVazia: 'Informe a senha atual',
  senhasDiferentes: 'As senhas não coincidem',
} as const;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function nomeError(nome: string): string | undefined {
  const aparado = nome.trim();
  if (aparado.length === 0) {
    return FIELD_TEXT.nomeVazio;
  }
  return [...aparado].length > USER_NAME_MAX_LENGTH ? FIELD_TEXT.nomeLongo : undefined;
}

export function emailError(email: string): string | undefined {
  const aparado = email.trim();
  return EMAIL.test(aparado) && [...aparado].length <= USER_EMAIL_MAX_LENGTH
    ? undefined
    : FIELD_TEXT.email;
}

/** Senha NOVA (registro): mínimo, teto em bytes e não só espaços. */
export function novaSenhaError(senha: string): string | undefined {
  switch (passwordProblem(senha)) {
    case null:
      return undefined;
    case 'so-espacos':
      return FIELD_TEXT.senhaSoEspacos;
    case 'longa':
      return FIELD_TEXT.senhaLonga;
    default:
      return FIELD_TEXT.senhaCurta;
  }
}

/** Senha do LOGIN: só não vazia e dentro do teto (o tamanho mínimo é do registro). */
export function loginSenhaError(senha: string): string | undefined {
  if (senha.length === 0) {
    return FIELD_TEXT.senhaLoginVazia;
  }
  return utf8ByteLength(senha) > PASSWORD_MAX_BYTES ? FIELD_TEXT.senhaLonga : undefined;
}

/** Senha ATUAL da troca: como a do login (pode ser uma senha antiga curta). */
export function senhaAtualError(senha: string): string | undefined {
  if (senha.length === 0) {
    return FIELD_TEXT.senhaAtualVazia;
  }
  return utf8ByteLength(senha) > PASSWORD_MAX_BYTES ? FIELD_TEXT.senhaLonga : undefined;
}

export function confirmacaoError(senha: string, confirmacao: string): string | undefined {
  return senha === confirmacao ? undefined : FIELD_TEXT.senhasDiferentes;
}
