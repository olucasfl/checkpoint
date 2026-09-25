/**
 * A URL que a API devolve para o vínculo só é seguida se for a tela de login da Steam (`https`,
 * `steamcommunity.com`, `/openid/login`). Defesa extra: o navegador nunca é mandado para um endereço qualquer
 * por causa de uma resposta adulterada.
 */
export function urlDaSteamSegura(url: unknown): url is string {
  if (typeof url !== 'string') {
    return false;
  }
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'https:' &&
      parsed.hostname === 'steamcommunity.com' &&
      parsed.port === '' &&
      parsed.username === '' &&
      parsed.password === '' &&
      parsed.pathname === '/openid/login'
    );
  } catch {
    return false;
  }
}
