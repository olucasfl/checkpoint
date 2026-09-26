import { Link } from 'react-router-dom';
import { useMovimentoReduzido } from '@/shared/hooks/use-movimento-reduzido';
import { type Game } from '@checkpoint/shared';
import { Icon } from '@/shared/components/Icon';
import { capasDoJogo } from '@/features/integracoes/lib/capa';
import { resumoDoCatalogo } from '@/features/integracoes/lib/conquistas';
import { nomeDaPlataforma } from '../lib/estante';
import { platformIcon } from '../lib/status-meta';
import { AnelDeNota } from './AnelDeNota';
import { GameCover } from './GameCover';
import { SeloDePlataformas } from './SeloDePlataformas';

interface GameTileProps {
  game: Game;
  onEdit: (game: Game) => void;
  onRemove: (game: Game) => void;
  /** Densidade "compacta" do /perfil: capas menores (120 × 160 no desktop, 108 × 144 no celular). */
  compacta?: boolean;
  /** O jogo acabou de ser criado: assenta com um anel que some. */
  novo?: boolean;
  /** Cópia visual de um jogo que acabou de sair: some sozinha, sem cliques nem leitor de tela. */
  saindo?: boolean;
}

const ACAO =
  'grid size-11 place-items-center rounded-full bg-fundo/90 text-texto transition-colors hover:bg-destaque hover:text-fundo';

/**
 * Um jogo na prateleira. A capa em pé leva o **anel da média** (só com média) no canto superior direito, o **chip da
 * plataforma** (só com plataforma) no inferior esquerdo, o **selo das plataformas ligadas** no superior esquerdo e, em aparelho com hover, **Editar** e **Remover** no inferior
 * direito. Abaixo: o título (o `<Link>` real do detalhe, esticado sobre o tile inteiro; as ações ficam por cima) e, só
 * nos jogos ligados à Steam, "42 h · 12/40". Em toque as ações não existem na tela: o caminho é abrir o jogo.
 */
export function GameTile({
  game,
  onEdit,
  onRemove,
  compacta = false,
  novo = false,
  saindo = false,
}: GameTileProps) {
  const reduzido = useMovimentoReduzido();
  const capas = capasDoJogo(game);
  const resumo = resumoDoCatalogo(game.dadosPlataforma);
  const plataforma = game.plataforma?.trim() ? nomeDaPlataforma(game.plataforma.trim()) : null;

  return (
    <li
      data-tile
      data-status={game.status}
      data-flip-id={game.id}
      data-novo={novo ? 'true' : undefined}
      {...(saindo ? { inert: true, 'aria-hidden': true } : {})}
      className={`tile relative flex shrink-0 snap-start flex-col gap-1.5 md:gap-2 ${
        compacta ? 'w-[108px] md:w-[120px]' : 'w-[132px] md:w-[150px]'
      }${novo ? ' tile-novo' : ''}${saindo ? ' tile-sai pointer-events-none' : ''}`}
    >
      <div className="tile-capa relative rounded-xl md:rounded-[14px]">
        {novo && <span aria-hidden="true" className="tile-anel-novo" />}
        <GameCover
          titulo={game.titulo}
          capaUrl={capas[0] ?? null}
          alternativas={capas.slice(1)}
          variant={compacta ? 'tileCompacto' : 'tile'}
        />
        <SeloDePlataformas dados={game.dadosPlataforma} />
        <div className="absolute right-2 top-2 md:right-2.5 md:top-2.5">
          <AnelDeNota nota={game.notaMedia} />
        </div>
        {plataforma && (
          <span
            data-chip-plataforma
            className="capa-chip absolute bottom-2 left-2 flex h-6 max-w-[calc(100%-1rem)] items-center gap-1 rounded-full px-2.5 text-xs font-bold text-texto md:h-[26px]"
          >
            <Icon name={platformIcon(plataforma)} size={14} className="shrink-0" />
            <span className="truncate">{plataforma}</span>
          </span>
        )}
        <div className="tile-acoes absolute bottom-2 right-2 z-10 flex-col gap-1.5">
          <button
            type="button"
            aria-label={`Editar ${game.titulo}`}
            onClick={() => onEdit(game)}
            className={ACAO}
          >
            <Icon name="edit" size={20} />
          </button>
          <button
            type="button"
            aria-label={`Remover ${game.titulo}`}
            onClick={() => onRemove(game)}
            className={ACAO}
          >
            <Icon name="delete" size={20} />
          </button>
        </div>
      </div>

      <Link
        to={`/jogos/${game.id}`}
        viewTransition={!reduzido}
        title={game.titulo}
        className="tile-titulo font-display text-[15px] font-semibold leading-tight text-texto after:absolute after:inset-0 after:content-[''] md:text-base"
      >
        {game.titulo}
      </Link>
      {resumo && (
        // Só o que já veio na lista (`dadosPlataforma`): o tile nunca consulta a plataforma.
        <span
          role="img"
          aria-label={resumo.rotulo}
          data-steam-resumo
          className="flex min-w-0 items-center gap-1 text-xs font-semibold text-texto-suave md:gap-1.5 md:text-[13px]"
        >
          <Icon name="sports_esports" size={15} className="shrink-0" />
          <span aria-hidden="true" className="truncate">
            {resumo.texto}
          </span>
        </span>
      )}
    </li>
  );
}
