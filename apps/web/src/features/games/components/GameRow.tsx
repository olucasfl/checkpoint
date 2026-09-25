import { Link } from 'react-router-dom';
import { type Game } from '@checkpoint/shared';
import { Icon } from '@/shared/components/Icon';
import { capasDoJogo } from '@/features/integracoes/lib/capa';
import { platformIcon } from '../lib/status-meta';
import { GameCover } from './GameCover';
import { RatingBar } from './RatingBar';
import { StatusBadge } from './StatusBadge';

interface GameRowProps {
  game: Game;
  onEdit: (game: Game) => void;
  onRemove: (game: Game) => void;
  /** Densidade compacta (preferência do /perfil): capa 40×40 e menos espaço; ações continuam 44×44. */
  compacta?: boolean;
}

const ACTION =
  'grid size-11 place-items-center rounded-[4px] text-texto-suave transition-colors hover:bg-acao-hover';

/**
 * Uma linha da lista: capa, título (o link do detalhe), plataforma, selo de status, a média das notas e as ações. No celular a
 * `.game-row` é uma grade (capa | texto + selo | ações, e a nota embaixo, com a largura toda); em
 * >= 768px, a linha única de antes. As áreas vêm de `data-area` (styles/index.css).
 */
export function GameRow({ game, onEdit, onRemove, compacta = false }: GameRowProps) {
  return (
    <li
      data-status={game.status}
      data-densidade={compacta ? 'compacta' : 'confortavel'}
      className={`row-hover game-row relative items-center rounded-md border border-borda bg-painel-2 px-3 md:px-4 ${
        compacta
          ? 'game-row-compacta gap-x-2.5 gap-y-1 py-1 md:gap-3.5'
          : 'gap-x-3 gap-y-2 py-2.5 md:gap-[18px]'
      }`}
    >
      <div data-area="capa" className="self-start md:self-center">
        <GameCover
          titulo={game.titulo}
          capaUrl={capasDoJogo(game)[0] ?? null}
          alternativas={capasDoJogo(game).slice(1)}
          variant={compacta ? 'compacta' : 'row'}
        />
      </div>

      <div data-area="texto" className="flex min-w-0 flex-col gap-0.5 md:flex-1">
        {/* O título é o link real do detalhe; o `after` o estica sobre a linha inteira (sem <a> aninhado nem
            onClick no <li>), e as ações, com z-10, ficam por cima e não navegam. */}
        <Link
          to={`/jogos/${game.id}`}
          className="game-title text-xl font-bold leading-tight tracking-[0.02em] after:absolute after:inset-0 after:content-[''] md:text-[23px]"
          title={game.titulo}
        >
          {game.titulo}
        </Link>
        {game.plataforma !== null && (
          <span className="flex min-w-0 items-center gap-1.5 text-base font-medium text-texto-suave">
            <Icon name={platformIcon(game.plataforma)} size={18} />
            <span className="truncate">{game.plataforma}</span>
          </span>
        )}
      </div>

      <div data-area="selo" className="flex md:w-40">
        <StatusBadge status={game.status} />
      </div>

      <div data-area="nota" className="flex items-center gap-3 md:w-[260px]">
        <RatingBar nota={game.notaMedia} compacta={compacta} />
      </div>

      <div data-area="acoes" className="relative z-10 flex gap-1 self-start md:self-center">
        <button
          type="button"
          aria-label={`Editar ${game.titulo}`}
          onClick={() => onEdit(game)}
          className={`${ACTION} hover:text-ciano`}
        >
          <Icon name="edit" size={22} />
        </button>
        <button
          type="button"
          aria-label={`Remover ${game.titulo}`}
          onClick={() => onRemove(game)}
          className={`${ACTION} hover:text-erro`}
        >
          <Icon name="delete" size={22} />
        </button>
      </div>
    </li>
  );
}
