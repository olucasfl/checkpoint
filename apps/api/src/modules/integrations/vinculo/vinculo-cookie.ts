import { type CookieOptions, type Response } from 'express';
import {
  VINCULO_COOKIE_NAME,
  VINCULO_COOKIE_PATH,
  VINCULO_STATE_TTL_SECONDS,
} from '../integrations.constants';

function baseOptions(secure: boolean): CookieOptions {
  // `HttpOnly`: o JS do web nunca o lê. `Lax`: o navegador o manda no retorno da Steam (uma navegação de
  // topo por GET vinda de outro site), mas não em requisições de terceiros. `Path` restrito às rotas de
  // integração. Sem `Domain`: o cookie é do host onde foi gravado (em produção, o da Vercel, o mesmo do
  // `return_to`). `Secure` só em produção, onde há HTTPS.
  return { httpOnly: true, sameSite: 'lax', path: VINCULO_COOKIE_PATH, secure };
}

/** Grava o nonce do vínculo, com a mesma vida do `state`. */
export function setVinculoCookie(response: Response, nonce: string, secure: boolean): void {
  response.cookie(VINCULO_COOKIE_NAME, nonce, {
    ...baseOptions(secure),
    maxAge: VINCULO_STATE_TTL_SECONDS * 1000,
  });
}

/** `Max-Age=0`, como o cookie do refresh: o navegador o descarta já. Usado em todo retorno, com ou sem sucesso. */
export function clearVinculoCookie(response: Response, secure: boolean): void {
  response.cookie(VINCULO_COOKIE_NAME, '', { ...baseOptions(secure), maxAge: 0 });
}
