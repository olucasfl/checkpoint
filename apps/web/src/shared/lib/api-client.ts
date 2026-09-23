import axios from 'axios';
import { env } from './env';

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
