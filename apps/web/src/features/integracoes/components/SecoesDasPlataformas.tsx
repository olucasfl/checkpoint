import { type Game, type Provedor, plataformasDisponiveis } from '@checkpoint/shared';
import { BlocoPlataforma } from './BlocoPlataforma';

/**
 * Uma seção por plataforma a que o jogo está ligado, na ordem do cadastro (Steam, PlayStation…). Sem ligação, nada. É
 * o MESMO componente para todas: as diferenças (conquistas ou troféus, links, textos) vêm do cadastro global, e a
 * página do jogo nunca compara o provedor com um texto.
 */
export function SecoesDasPlataformas({ game }: { game: Game }) {
  const ligadas = plataformasDisponiveis().filter((plataforma) =>
    game.dadosPlataforma.some((dados) => dados.provedor === plataforma.id),
  );
  return (
    <>
      {ligadas.map((plataforma) => (
        <BlocoPlataforma key={plataforma.id} game={game} provedor={plataforma.id as Provedor} />
      ))}
    </>
  );
}
