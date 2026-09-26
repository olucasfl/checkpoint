import { type ComponentType } from 'react';
import { type Game, type Provedor, plataformasDisponiveis } from '@checkpoint/shared';
import { BlocoSteam } from './BlocoSteam';

/**
 * O corpo da seção de cada plataforma. É um `Record<Provedor, …>`: uma plataforma nova no cadastro não compila
 * enquanto não tiver o seu corpo aqui, e a página do jogo nunca compara o provedor com um texto.
 */
const CORPO_DA_SECAO: Record<Provedor, ComponentType<{ game: Game }>> = {
  STEAM: BlocoSteam,
};

/** Uma seção por plataforma a que o jogo está ligado, na ordem do cadastro. Sem ligação, nada. */
export function SecoesDasPlataformas({ game }: { game: Game }) {
  const ligadas = plataformasDisponiveis().filter((plataforma) =>
    game.dadosPlataforma.some((dados) => dados.provedor === plataforma.id),
  );
  return (
    <>
      {ligadas.map((plataforma) => {
        const Corpo = CORPO_DA_SECAO[plataforma.id as Provedor];
        return <Corpo key={plataforma.id} game={game} />;
      })}
    </>
  );
}
