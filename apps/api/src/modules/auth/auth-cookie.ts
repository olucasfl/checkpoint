import { type CookieOptions, type Response } from 'express';
import {
  REFRESH_COOKIE_NAME,
  REFRESH_COOKIE_PATH,
  REFRESH_TOKEN_TTL_SECONDS,
} from './auth.constants';

function baseOptions(secure: boolean): CookieOptions {
  // `Path` restrito às rotas de auth: o cookie não viaja nas demais. `Lax` em dev (localhost:5173 →
  // localhost:3333 é o mesmo site); `Secure` só em produção, onde há HTTPS.
  return { httpOnly: true, sameSite: 'lax', path: REFRESH_COOKIE_PATH, secure };
}

export function setRefreshCookie(response: Response, token: string, secure: boolean): void {
  response.cookie(REFRESH_COOKIE_NAME, token, {
    ...baseOptions(secure),
    maxAge: REFRESH_TOKEN_TTL_SECONDS * 1000,
  });
}

/** `Max-Age=0` (e não `clearCookie`, que só põe uma data no passado): o navegador o descarta já. */
export function clearRefreshCookie(response: Response, secure: boolean): void {
  response.cookie(REFRESH_COOKIE_NAME, '', { ...baseOptions(secure), maxAge: 0 });
}
