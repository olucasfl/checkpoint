import { isAxiosError } from 'axios';
import {
  API_ERROR_CODES,
  type ApiErrorCode,
  type ApiErrorField,
  type ApiErrorResponse,
} from '@checkpoint/shared';

/**
 * O texto de cada erro da API, pelo `code`. O tipo `Record<ApiErrorCode, string>` é exaustivo: um
 * código novo no shared quebra o `typecheck` aqui até ganhar texto. Nada neste código compara a
 * `message` da API (ela é para quem lê o corpo com `curl`).
 */
export const AUTH_MESSAGES: Record<ApiErrorCode, string> = {
  VALIDACAO: 'Confira os campos e tente de novo.',
  AUTH_EMAIL_EM_USO: 'Este e-mail já tem uma conta. Entre com a sua senha.',
  AUTH_REGISTRO_FECHADO: 'O cadastro de novas contas está fechado.',
  AUTH_CREDENCIAIS_INVALIDAS: 'E-mail ou senha incorretos.',
  AUTH_NAO_AUTENTICADO: 'Entre para continuar.',
  // O web renova sozinho; o texto só aparece se a renovação falhar de um jeito que não desloga.
  AUTH_TOKEN_EXPIRADO: 'Sua sessão expirou. Tente de novo.',
  AUTH_SESSAO_ENCERRADA: 'Sua sessão terminou. Entre de novo.',
  // O web tenta de novo sozinho; o texto é o de reserva.
  AUTH_REFRESH_CONCORRENTE: 'A sessão acabou de ser renovada. Tente de novo.',
  AUTH_SENHA_ATUAL_INCORRETA: 'Senha atual incorreta.',
  AUTH_SENHA_IGUAL_ATUAL: 'A nova senha precisa ser diferente da atual.',
  AUTH_ORIGEM_INVALIDA: 'Não foi possível completar a requisição.',
  LIMITE_TENTATIVAS: 'Muitas tentativas. Aguarde um pouco e tente de novo.',
  // Sessões ativas do /perfil (spec perfil, etapa 2).
  SESSAO_ATUAL: 'Para encerrar esta sessão, use Sair.',
  SESSAO_NAO_ENCONTRADA: 'Essa sessão já foi encerrada.',
  // Integrações com plataformas (spec integracao-plataformas).
  PLATAFORMA_NAO_VINCULADA: 'Vincule sua conta no perfil para continuar.',
  PLATAFORMA_JA_VINCULADA: 'Você já tem outra conta vinculada. Desvincule-a antes.',
  PLATAFORMA_PERFIL_PRIVADO: 'Seu perfil está privado. Deixe-o público e tente de novo.',
  PLATAFORMA_ITEM_NAO_ENCONTRADO: 'Esse jogo não está na sua biblioteca.',
  PLATAFORMA_ITEM_JA_VINCULADO: 'Esse jogo da biblioteca já está ligado a outro jogo seu.',
  PLATAFORMA_JOGO_JA_VINCULADO: 'Este jogo já está ligado a um item da plataforma.',
  PLATAFORMA_VINCULO_NAO_ENCONTRADO: 'Este jogo não está ligado à plataforma.',
  PLATAFORMA_INDISPONIVEL: 'Não foi possível falar com a plataforma agora. Tente de novo.',
  PLATAFORMA_LIMITE: 'Muitas consultas à plataforma. Tente de novo em alguns minutos.',
};

export const NO_CONNECTION_MESSAGE = 'Sem conexão. Tente de novo quando a conexão voltar.';
export const UNEXPECTED_MESSAGE = 'Algo deu errado. Tente de novo.';

export interface AuthFormError {
  /** Mensagem geral do formulário (vazia quando a API apontou campos). */
  message: string;
  fields: Partial<Record<ApiErrorField, string>>;
  code?: ApiErrorCode;
}

export function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return (API_ERROR_CODES as readonly unknown[]).includes(value);
}

function bodyOf(error: unknown): Partial<ApiErrorResponse> | undefined {
  if (!isAxiosError(error)) {
    return undefined;
  }
  const data: unknown = error.response?.data;
  return typeof data === 'object' && data !== null
    ? (data as Partial<ApiErrorResponse>)
    : undefined;
}

/** O `code` de um erro de axios, se a API mandou um conhecido. */
export function errorCode(error: unknown): ApiErrorCode | undefined {
  const code = bodyOf(error)?.code;
  return isApiErrorCode(code) ? code : undefined;
}

/**
 * Converte o erro de uma chamada de auth no que o formulário mostra: as mensagens por campo em
 * `fields` (quando a API as aponta) e uma mensagem geral pelo `code`.
 */
export function describeAuthError(error: unknown): AuthFormError {
  if (isAxiosError(error) && !error.response) {
    return { message: NO_CONNECTION_MESSAGE, fields: {} };
  }

  const code = errorCode(error);
  if (!code) {
    return { message: UNEXPECTED_MESSAGE, fields: {} };
  }

  const fields: AuthFormError['fields'] = {};
  for (const [name, text] of Object.entries(bodyOf(error)?.fields ?? {})) {
    if (typeof text === 'string') {
      fields[name as ApiErrorField] = text;
    }
  }

  // Com um campo apontado, a mensagem geral repetiria o texto do campo.
  return Object.keys(fields).length > 0
    ? { message: '', fields, code }
    : { message: AUTH_MESSAGES[code], fields: {}, code };
}
