import axios, { type AxiosRequestConfig } from 'axios';
import { getAccessToken } from './auth-token';
import { connectivity } from './connectivity';
import { env } from './env';
import { getSessionHandlers } from './session-handlers';

/**
 * Marcas no `config` da requisição (em vez de olhar a URL, para não depender do caminho):
 * - `isConnectivityProbe`: a sondagem de conectividade. Uma sondagem que falha não pode realimentar o
 *   detector (o interceptor a reportaria de novo e o agendamento entraria em laço) nem passar pela
 *   renovação de sessão.
 * - `isAuthCall`: registro, login, refresh e logout. Não levam o Bearer e nunca disparam a renovação
 *   (o refresh que renova a si mesmo entraria em laço).
 * - `sessionRetried`: a requisição já foi repetida uma vez depois de uma renovação.
 */
export type ApiRequestConfig = AxiosRequestConfig & {
  isConnectivityProbe?: boolean;
  isAuthCall?: boolean;
  sessionRetried?: boolean;
};

/** Sem resposta = a requisição não chegou ao servidor ou a resposta não voltou. */
const NO_RESPONSE_CODES = new Set(['ERR_NETWORK', 'ECONNABORTED', 'ETIMEDOUT']);

/**
 * Instancia unica do axios usada por toda a aplicacao.
 * A baseURL vem da env VITE_API_URL e ja inclui o prefixo global `/api` da API.
 */
export const apiClient = axios.create({
  baseURL: env.apiUrl,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10_000,
});

apiClient.interceptors.request.use((config) => {
  const { isAuthCall, isConnectivityProbe } = config as ApiRequestConfig;
  const token = getAccessToken();
  if (token && !isAuthCall && !isConnectivityProbe) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => {
    connectivity.reportReachable();
    return response;
  },
  (error: unknown) => {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        // Um 4xx/5xx também prova que a API está de pé.
        connectivity.reportReachable();
      } else if (
        !(error.config as ApiRequestConfig | undefined)?.isConnectivityProbe &&
        NO_RESPONSE_CODES.has(error.code ?? '')
      ) {
        connectivity.reportUnreachable();
      }
    }
    return Promise.reject(error);
  },
);

/** O `code` de um erro da API (`ApiErrorResponse.code`), se houver. */
function errorCodeOf(error: unknown): string | undefined {
  if (!axios.isAxiosError(error)) {
    return undefined;
  }
  const data: unknown = error.response?.data;
  if (typeof data === 'object' && data !== null && 'code' in data) {
    const { code } = data as { code?: unknown };
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

/**
 * Sessão: um 401 com `AUTH_TOKEN_EXPIRADO` renova o token UMA vez (as requisições paralelas
 * compartilham a mesma renovação) e repete a original UMA vez; `AUTH_SESSAO_ENCERRADA` é logout local.
 * Registrado depois do interceptor de conectividade: as duas coisas veem toda resposta.
 */
apiClient.interceptors.response.use(undefined, async (error: unknown) => {
  const handlers = getSessionHandlers();
  if (!handlers || !axios.isAxiosError(error) || error.response?.status !== 401) {
    return Promise.reject(error);
  }
  const config = error.config as ApiRequestConfig | undefined;
  if (!config || config.isAuthCall || config.isConnectivityProbe) {
    return Promise.reject(error);
  }

  const code = errorCodeOf(error);

  if (code === 'AUTH_SESSAO_ENCERRADA') {
    handlers.onSessionEnded();
    return Promise.reject(error);
  }

  if (code === 'AUTH_TOKEN_EXPIRADO' && !config.sessionRetried) {
    const outcome = await handlers.refresh();
    if (outcome.kind === 'ok') {
      config.sessionRetried = true;
      return apiClient.request(config);
    }
    if (outcome.kind === 'sessao-encerrada') {
      handlers.onSessionEnded();
      return Promise.reject(error);
    }
    // Sem rede (ou 5xx/429) na renovação: a requisição original falha como erro de rede, SEM deslogar.
    return Promise.reject(outcome.error);
  }

  return Promise.reject(error);
});

connectivity.setProbe(() =>
  apiClient.get('/health', {
    isConnectivityProbe: true,
    // Qualquer status prova que o servidor respondeu; só a falta de resposta rejeita.
    validateStatus: () => true,
    timeout: 5_000,
  } as ApiRequestConfig),
);
