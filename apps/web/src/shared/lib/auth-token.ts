/**
 * O access token vive SÓ aqui, numa variável de módulo (spec autenticacao, Q1). Nunca em
 * armazenamento local, de sessão, IndexedDB nem cookie legível: qualquer script da página leria o
 * token de lá. O preço é que recarregar a página o perde; o `refresh` (cookie HttpOnly) o recupera.
 */
let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}
