import { type Game } from '@checkpoint/shared';

/**
 * As imagens de um jogo, em ordem de PRECEDÊNCIA (spec `integracao-plataformas`, CA-42, e `troca-de-design-estante`,
 * questão 9): a capa enviada e, depois, a oficial da plataforma (`library_600x900`, já em pé). A capa gerada (cor e
 * iniciais) é o último recurso e não entra aqui: o `GameCover` a mostra quando todas as anteriores faltam ou falham.
 * O `header.jpg` (largo) saiu da cadeia: numa capa em pé ele seria um recorte do meio de uma imagem larga. Sem estado
 * gravado: remover a capa enviada faz a oficial reaparecer sozinha.
 */
export function capasDoJogo(game: Pick<Game, 'capaUrl' | 'dadosPlataforma'>): string[] {
  const capas: string[] = [];
  if (game.capaUrl) {
    capas.push(game.capaUrl);
  }
  const oficial = game.dadosPlataforma.find((dados) => dados.capaUrl)?.capaUrl ?? null;
  if (oficial) {
    capas.push(oficial);
  }
  return capas;
}
