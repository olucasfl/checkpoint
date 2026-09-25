/** CDN da Steam para as imagens de um app (sem chave). Confirmado em 2026-09-25: 200 `image/jpeg`. */
const STEAM_APPS_CDN = 'https://cdn.cloudflare.steamstatic.com/steam/apps';

/**
 * A capa oficial em retrato (600 × 900). Nem todo app tem essa imagem (sem ela, a CDN responde 404): o web cai
 * em `header.jpg` e depois na capa gerada. É ligada direto na CDN, nunca copiada para o bucket.
 */
export function capaOficialUrl(appId: string): string {
  return `${STEAM_APPS_CDN}/${appId}/library_600x900.jpg`;
}

function parseHttps(url: string | null): URL | null {
  if (url === null) {
    return null;
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.username === '' && parsed.password === ''
      ? parsed
      : null;
  } catch {
    return null;
  }
}

/**
 * O avatar só é devolvido se for `https` num host da própria Steam (`steamstatic.com` ou subdomínio):
 * a URL vem de uma resposta externa e vai parar num `<img>`, então nunca é repassada sem conferir.
 */
export function avatarUrlSeguro(url: string | null): string | null {
  const parsed = parseHttps(url);
  if (!parsed) {
    return null;
  }
  const host = parsed.hostname.toLowerCase();
  return host === 'steamstatic.com' || host.endsWith('.steamstatic.com') ? parsed.toString() : null;
}

/** O link do perfil só vale se for `https` em `steamcommunity.com`. */
export function perfilUrlSeguro(url: string | null): string | null {
  const parsed = parseHttps(url);
  return parsed?.hostname.toLowerCase() === 'steamcommunity.com' ? parsed.toString() : null;
}
