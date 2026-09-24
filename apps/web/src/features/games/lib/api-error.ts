import { isAxiosError } from 'axios';
import { type ApiErrorResponse } from '@checkpoint/shared';

/** Campos do formulário; `arquivo` da API é a área da capa. */
export type FormFieldName = 'titulo' | 'plataforma' | 'status' | 'nota' | 'capa';

export interface FormError {
  /** Mensagem geral (mostrada no formulário só quando nenhum campo foi apontado). */
  message: string;
  fields: Partial<Record<FormFieldName, string>>;
}

export const OFFLINE_NOT_SAVED =
  'Sem conexão. Nada foi salvo — tente de novo quando a conexão voltar.';
/** O jogo já foi salvo antes de a capa falhar: dizer "nada foi salvo" seria falso. */
export const OFFLINE_COVER_NOT_SAVED =
  'Sem conexão. O jogo foi salvo, mas a capa não — tente de novo quando a conexão voltar.';
/** Tempo esgotado: o servidor pode ter gravado sem conseguir responder, então não afirma "nada foi salvo". */
export const NO_ANSWER =
  'O servidor não respondeu a tempo. Confira a lista antes de tentar de novo.';
export const UNEXPECTED_ERROR = 'Algo deu errado. Tente de novo.';

function isApiErrorBody(data: unknown): data is ApiErrorResponse {
  if (typeof data !== 'object' || data === null) {
    return false;
  }
  const body = data as Record<string, unknown>;
  return typeof body.statusCode === 'number' && typeof body.message === 'string';
}

function mapFields(fields: ApiErrorResponse['fields']): FormError['fields'] {
  const mapped: FormError['fields'] = {};

  for (const [name, message] of Object.entries(fields ?? {})) {
    if (typeof message === 'string') {
      mapped[name === 'arquivo' ? 'capa' : (name as FormFieldName)] = message;
    }
  }

  return mapped;
}

/**
 * A mensagem geral só serve quando a API NÃO apontou nenhum campo; senão ela repetiria o texto do
 * campo (e reapareceria no topo assim que o usuário limpasse o campo).
 */
export function forForm(error: FormError): FormError {
  return Object.keys(error.fields).length > 0 ? { message: '', fields: error.fields } : error;
}

/** `capa`: a falha é da capa DEPOIS de o jogo ter sido salvo. `jogo`: qualquer outra escrita. */
export type ErrorContext = 'jogo' | 'capa';

const TIMEOUT_CODES = new Set(['ECONNABORTED', 'ETIMEDOUT']);

/**
 * Converte o erro de uma chamada à API no que o formulário mostra: a mensagem de cada campo em
 * `fields` (para aparecer junto do campo certo) e uma mensagem geral de reserva.
 */
export function describeError(error: unknown, context: ErrorContext = 'jogo'): FormError {
  if (isAxiosError(error)) {
    if (!error.response) {
      if (TIMEOUT_CODES.has(error.code ?? '')) {
        return { message: NO_ANSWER, fields: {} };
      }
      return {
        message: context === 'capa' ? OFFLINE_COVER_NOT_SAVED : OFFLINE_NOT_SAVED,
        fields: {},
      };
    }
    const data: unknown = error.response.data;
    if (isApiErrorBody(data)) {
      return { message: data.message, fields: mapFields(data.fields) };
    }
  }

  return { message: UNEXPECTED_ERROR, fields: {} };
}
