/**
 * Acesso centralizado e tipado as variaveis de ambiente do Vite.
 * Toda env nova deve ser declarada em `src/vite-env.d.ts` e exposta aqui.
 */
export const env = {
  apiUrl: import.meta.env.VITE_API_URL,
} as const;
