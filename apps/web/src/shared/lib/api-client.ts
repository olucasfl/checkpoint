import axios, { type AxiosRequestConfig } from 'axios';
import { connectivity } from './connectivity';
import { env } from './env';

/**
 * Marca as chamadas de sondagem. Só elas: uma sondagem que falha não pode realimentar o detector
 * (o interceptor a reportaria de novo e o agendamento entraria em laço). Uma marca no `config`
 * em vez de uma URL, para não depender do caminho.
 */
type ProbeConfig = AxiosRequestConfig & { isConnectivityProbe?: boolean };

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
        !(error.config as ProbeConfig | undefined)?.isConnectivityProbe &&
        NO_RESPONSE_CODES.has(error.code ?? '')
      ) {
        connectivity.reportUnreachable();
      }
    }
    return Promise.reject(error);
  },
);

connectivity.setProbe(() =>
  apiClient.get('/health', {
    isConnectivityProbe: true,
    // Qualquer status prova que o servidor respondeu; só a falta de resposta rejeita.
    validateStatus: () => true,
    timeout: 5_000,
  } as ProbeConfig),
);
