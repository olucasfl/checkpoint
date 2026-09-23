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

/** Uma linha da lista: capa, título, plataforma, selo de status, nota e as ações. */
export function GameRow({ game, onEdit, onRemove }: GameRowProps) {
  return (
    <li
      data-status={game.status}
      className="row-hover flex items-center gap-[18px] rounded-md border border-borda bg-painel-2 px-4 py-2.5 max-[900px]:flex-wrap"
    >
      <GameCover titulo={game.titulo} capaUrl={game.capaUrl} />

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[23px] font-bold tracking-[0.02em]" title={game.titulo}>
          {game.titulo}
        </span>
        {game.plataforma !== null && (
          <span className="flex items-center gap-1.5 text-base font-medium text-texto-suave">
            <Icon name={platformIcon(game.plataforma)} size={18} />
            {game.plataforma}
          </span>
        )}
      </div>

      <div className="flex w-40 max-[900px]:w-auto">
        <StatusBadge status={game.status} />
      </div>

      <div className="flex w-[260px] items-center gap-3 max-[900px]:w-auto">
        <RatingBar nota={game.nota} />
      </div>

      <div className="flex gap-1">
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
