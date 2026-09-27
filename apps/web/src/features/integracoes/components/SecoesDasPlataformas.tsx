import { type ComponentType } from 'react';
import { type Game, type Provedor, plataformasDisponiveis } from '@checkpoint/shared';
import { BlocoSteam } from './BlocoSteam';

/**
 * O corpo da seção de cada plataforma. A PlayStation entra no cadastro desligada (`disponivel: false`) e ganha o seu
 * corpo na F3 da spec `integracao-playstation`; a página do jogo nunca compara o provedor com um texto.
 */
const CORPO_DA_SECAO: Partial<Record<Provedor, ComponentType<{ game: Game }>>> = {
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
        return Corpo ? <Corpo key={plataforma.id} game={game} /> : null;
      })}
    </>
  );
}
