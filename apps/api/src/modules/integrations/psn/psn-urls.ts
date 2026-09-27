const URL_MAX = 300;

/**
 * Imagens da PlayStation (capa/ícone do jogo, avatar, ícone de troféu): a URL vem de uma resposta externa e vai
 * parar num `<img>`, então só passa se for `https`, sem credenciais, num host da própria PlayStation
 * (`playstation.com` ou `playstation.net`, e subdomínios) e com até 300 caracteres.
 */
export function imagemUrlSegura(url: string | null | undefined): string | null {
  if (typeof url !== 'string' || url.length > URL_MAX) {
    return null;
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.username !== '' || parsed.password !== '') {
      return null;
    }
    const host = parsed.hostname.toLowerCase();
    const permitido = ['playstation.com', 'playstation.net'].some(
      (dominio) => host === dominio || host.endsWith(`.${dominio}`),
    );
    return permitido ? parsed.toString() : null;
  } catch {
    return null;
  }
}
