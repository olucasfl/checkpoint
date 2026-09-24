const MAX_LENGTH = 512;
/** Ir para o login logo depois de entrar seria um laço. */
const AUTH_PATHS = /^\/(login|registro)(\/|$)/;

/** Caracteres de controle (C0 e DEL): `\n`, `\r`, `\t` e afins servem para esconder um destino. */
function hasControlChar(text: string): boolean {
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code <= 0x1f || code === 0x7f) {
      return true;
    }
  }
  return false;
}

function isSafePath(path: string): boolean {
  if (!path.startsWith('/') || path.length > MAX_LENGTH || hasControlChar(path)) {
    return false;
  }
  // "//host" e "/\host" são lidos pelo navegador como outro host.
  if (path[1] === '/' || path[1] === '\\') {
    return false;
  }
  try {
    const url = new URL(path, window.location.origin);
    return url.origin === window.location.origin && !AUTH_PATHS.test(url.pathname);
  } catch {
    return false;
  }
}

function decodeOnce(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

/**
 * `?voltar=` seguro (spec autenticacao): aceita só um caminho INTERNO do app. Qualquer outra coisa
 * (outro host, esquema, `//`, `/\`, controle, longo demais, `/login`, `/registro`) vira `/`. O valor é
 * conferido como veio E decodificado, para `%2F%2Fhost` não passar por caminho.
 */
export function safeRedirect(value: string | null | undefined): string {
  if (!value) {
    return '/';
  }
  const decoded = decodeOnce(value);
  return decoded !== null && isSafePath(value) && isSafePath(decoded) ? value : '/';
}
