/**
 * Contrato de autenticação compartilhado entre a API e o web (spec autenticacao).
 * Só código puro: nada de `window`, Node ou Prisma. Nomes de cookie, TTLs e segredos ficam na API.
 */

export const USER_NAME_MAX_LENGTH = 60;
export const USER_EMAIL_MAX_LENGTH = 254;
/** Caracteres (code points), não bytes. */
export const PASSWORD_MIN_LENGTH = 8;
/** Bytes em UTF-8: o teto do bcrypt, mantido para a troca de algoritmo não invalidar senhas. */
export const PASSWORD_MAX_BYTES = 72;

/** Cabeçalho que `refresh` e `logout` exigem (força preflight de CORS: defesa contra CSRF). */
export const CSRF_HEADER = 'X-Checkpoint-Csrf';

/** trim + minúsculas. A API normaliza antes de validar e de gravar; o web, antes de enviar. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Tamanho em bytes UTF-8, calculado pelos code points. Sem `TextEncoder`/`Buffer`: o shared é
 * agnóstico de plataforma. Um surrogate solto conta 3 bytes, como o U+FFFD que o `TextEncoder` grava.
 */
export function utf8ByteLength(texto: string): number {
  let bytes = 0;
  for (const caractere of texto) {
    const codePoint = caractere.codePointAt(0) ?? 0;
    if (codePoint <= 0x7f) {
      bytes += 1;
    } else if (codePoint <= 0x7ff) {
      bytes += 2;
    } else if (codePoint <= 0xffff) {
      bytes += 3;
    } else {
      bytes += 4;
    }
  }
  return bytes;
}

export type PasswordProblem = 'vazia' | 'so-espacos' | 'curta' | 'longa';

/** Regra da senha nova: `null` se estiver ok. Espaços contam (nenhuma normalização). */
export function passwordProblem(senha: string): PasswordProblem | null {
  if (senha.length === 0) {
    return 'vazia';
  }
  if (senha.trim().length === 0) {
    return 'so-espacos';
  }
  if ([...senha].length < PASSWORD_MIN_LENGTH) {
    return 'curta';
  }
  if (utf8ByteLength(senha) > PASSWORD_MAX_BYTES) {
    return 'longa';
  }
  return null;
}

export interface Usuario {
  id: string;
  nome: string;
  email: string;
  /** ISO 8601. */
  criadoEm: string;
}

export interface RegistroRequest {
  nome: string;
  email: string;
  senha: string;
}

export interface LoginRequest {
  email: string;
  senha: string;
}

export interface AuthResponse {
  accessToken: string;
  usuario: Usuario;
}

export interface TrocarSenhaRequest {
  senhaAtual: string;
  novaSenha: string;
}

/** Corpo de `PATCH /api/users/me` (spec perfil). Só o nome: o e-mail não é editável. */
export interface AtualizarPerfilRequest {
  nome: string;
}

/**
 * Uma sessão (aparelho) do usuário logado, em `GET /api/auth/sessoes` (spec perfil). Só isto: nunca
 * os hashes do refresh, o vencimento nem o `userId`.
 */
export interface SessaoAtiva {
  id: string;
  /** Rótulo legível ("Chrome · Android"), derivado do User-Agent no login. */
  dispositivo: string;
  /** ISO 8601. */
  criadoEm: string;
  /** ISO 8601. */
  ultimoUsoEm: string;
  /** É a sessão da própria request ("Este aparelho"). */
  atual: boolean;
}

/** Resposta de `DELETE /api/auth/sessoes` (encerrar todas as outras). */
export interface EncerrarOutrasSessoesResponse {
  encerradas: number;
}

/** Códigos estáveis dos erros: o web mostra o texto pelo `code`, nunca comparando a `message`. */
export const API_ERROR_CODES = [
  'VALIDACAO',
  'AUTH_EMAIL_EM_USO',
  'AUTH_REGISTRO_FECHADO',
  'AUTH_CREDENCIAIS_INVALIDAS',
  'AUTH_NAO_AUTENTICADO',
  'AUTH_TOKEN_EXPIRADO',
  'AUTH_SESSAO_ENCERRADA',
  'AUTH_REFRESH_CONCORRENTE',
  'AUTH_SENHA_ATUAL_INCORRETA',
  'AUTH_SENHA_IGUAL_ATUAL',
  'AUTH_ORIGEM_INVALIDA',
  'LIMITE_TENTATIVAS',
  // Sessões ativas (spec perfil, etapa 2).
  'SESSAO_ATUAL',
  'SESSAO_NAO_ENCONTRADA',
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];
