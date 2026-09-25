import { type Game } from '@checkpoint/shared';

/** A capa oficial em retrato que a API grava em `dadosPlataforma[].capaUrl` (Steam: `library_600x900.jpg`). */
const OFICIAL =
  /^(https:\/\/cdn\.cloudflare\.steamstatic\.com\/steam\/apps\/\d{1,10}\/)library_600x900\.jpg$/;

/**
 * Nem todo app tem a capa em retrato (a CDN responde 404): a alternativa é o `header.jpg` do MESMO app, na mesma
 * CDN. Só a URL oficial conhecida vira alternativa; qualquer outra coisa não vira (a URL vem da API, mas o web não
 * inventa endereço a partir de texto arbitrário).
 */
export function capaOficialAlternativa(url: string): string | null {
  const achou = OFICIAL.exec(url);
  return achou ? `${achou[1]}header.jpg` : null;
}

/**
 * As imagens de um jogo, em ordem de PRECEDÊNCIA (spec `integracao-plataformas`, CA-42): a capa enviada; depois a
 * oficial da plataforma e, se ela falhar ao carregar, o `header.jpg`. A capa gerada (cor e iniciais) é o último
 * recurso e não entra aqui: o `GameCover` a mostra quando todas as anteriores faltam ou falham. Sem estado gravado:
 * remover a capa enviada faz a oficial reaparecer sozinha.
 */
export function capasDoJogo(game: Pick<Game, 'capaUrl' | 'dadosPlataforma'>): string[] {
  const capas: string[] = [];
  if (game.capaUrl) {
    capas.push(game.capaUrl);
  }
  const oficial = game.dadosPlataforma.find((dados) => dados.capaUrl)?.capaUrl ?? null;
  if (oficial) {
    capas.push(oficial);
    const alternativa = capaOficialAlternativa(oficial);
    if (alternativa) {
      capas.push(alternativa);
    }
  }
  return capas;
}
