import { type Game } from '@checkpoint/shared';
import { Icon } from '@/shared/components/Icon';
import { platformIcon } from '../lib/status-meta';
import { GameCover } from './GameCover';
import { RatingBar } from './RatingBar';
import { StatusBadge } from './StatusBadge';

interface GameRowProps {
  game: Game;
  onEdit: (game: Game) => void;
  onRemove: (game: Game) => void;
}

const ACTION =
  'grid size-11 place-items-center rounded-[4px] text-texto-suave transition-colors hover:bg-acao-hover';

/**
 * Uma linha da lista: capa, título, plataforma, selo de status, nota e as ações. No celular a
 * `.game-row` é uma grade (capa | texto + selo | ações, e a nota embaixo, com a largura toda); em
 * >= 768px, a linha única de antes. As áreas vêm de `data-area` (styles/index.css).
 */
export function GameRow({ game, onEdit, onRemove }: GameRowProps) {
  return (
    <li
      data-status={game.status}
      className="row-hover game-row items-center gap-x-3 gap-y-2 rounded-md border border-borda bg-painel-2 px-3 py-2.5 md:gap-[18px] md:px-4"
    >
      <div data-area="capa" className="self-start md:self-center">
        <GameCover titulo={game.titulo} capaUrl={game.capaUrl} />
      </div>

      <div data-area="texto" className="flex min-w-0 flex-col gap-0.5 md:flex-1">
        <span
          className="game-title text-xl font-bold leading-tight tracking-[0.02em] md:text-[23px]"
          title={game.titulo}
        >
          {game.titulo}
        </span>
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
        <RatingBar nota={game.nota} />
      </div>

      <div data-area="acoes" className="flex gap-1 self-start md:self-center">
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
