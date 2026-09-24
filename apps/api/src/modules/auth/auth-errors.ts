import { type HttpException } from '@nestjs/common';
import { type ApiErrorCode } from '@checkpoint/shared';
import { apiError } from '../../common/errors/api-error';

/**
 * Os erros da autenticação, um por `code`. As mensagens são para quem lê o corpo (curl, Swagger); o
 * web mostra o texto pelo `code` e nunca compara a `message`.
 */
export const authErrors = {
  emailEmUso: () =>
    apiError(409, 'AUTH_EMAIL_EM_USO', 'Este e-mail já tem uma conta', {
      email: 'Este e-mail já tem uma conta',
    }),
  registroFechado: () =>
    apiError(403, 'AUTH_REGISTRO_FECHADO', 'O cadastro de novas contas está fechado.'),
  // Corpo IDÊNTICO para e-mail inexistente e senha errada: nada aqui pode denunciar qual dos dois foi.
  credenciaisInvalidas: () =>
    apiError(401, 'AUTH_CREDENCIAIS_INVALIDAS', 'E-mail ou senha incorretos.'),
  naoAutenticado: () => apiError(401, 'AUTH_NAO_AUTENTICADO', 'Entre para continuar.'),
  tokenExpirado: () => apiError(401, 'AUTH_TOKEN_EXPIRADO', 'O token de acesso expirou.'),
  sessaoEncerrada: () =>
    apiError(401, 'AUTH_SESSAO_ENCERRADA', 'Sua sessão terminou. Entre de novo.'),
  refreshConcorrente: () =>
    apiError(
      409,
      'AUTH_REFRESH_CONCORRENTE',
      'A sessão acabou de ser renovada por outra requisição.',
    ),
  origemInvalida: () =>
    apiError(403, 'AUTH_ORIGEM_INVALIDA', 'Não foi possível completar a requisição.'),
  limiteTentativas: () =>
    apiError(429, 'LIMITE_TENTATIVAS', 'Muitas tentativas. Aguarde um pouco e tente de novo.'),
};

/** O `code` de um erro da API, ou `undefined` se não for um erro no nosso formato. */
export function errorCode(error: unknown): ApiErrorCode | undefined {
  const response = (error as HttpException | undefined)?.getResponse?.();
  if (typeof response === 'object' && response !== null && 'code' in response) {
    return (response as { code?: ApiErrorCode }).code;
  }
  return undefined;
}
