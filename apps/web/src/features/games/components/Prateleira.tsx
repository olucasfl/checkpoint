import { type Game, type GameStatus } from '@checkpoint/shared';
import { Icon } from '@/shared/components/Icon';
import { STATUS_META } from '../lib/status-meta';
import { GameTile } from './GameTile';

interface PrateleiraProps {
  status: GameStatus;
  titulo: string;
  icone: string;
  jogos: readonly Game[];
  onEdit: (game: Game) => void;
  onRemove: (game: Game) => void;
  /** O botão-bloco ao fim da prateleira: abre o formulário de novo jogo com o status dela. */
  onAdicionar: (status: GameStatus) => void;
  compacta?: boolean;
}

/**
 * Uma prateleira da estante: ícone na cor do status, título, contador e a lista. No celular a lista rola na horizontal
 * DENTRO dela (a página não rola); a partir de 768 px quebra em linhas (grade de colunas do tamanho da capa), então o
 * anel e a elevação do hover nunca são cortados por um contêiner de rolagem. O botão-bloco "Adicionar" fecha a lista.
 */
export function Prateleira({
  status,
  titulo,
  icone,
  jogos,
  onEdit,
  onRemove,
  onAdicionar,
  compacta = false,
}: PrateleiraProps) {
  const tituloId = `prateleira-${status.toLowerCase()}`;
  const bloco = compacta
    ? 'h-[144px] w-[108px] md:h-[160px] md:w-[120px]'
    : 'h-[176px] w-[132px] md:h-[200px] md:w-[150px]';

  return (
    <section
      aria-labelledby={tituloId}
      data-prateleira={status}
      className="flex min-w-0 flex-col gap-3 md:gap-4"
    >
      <div className="flex items-center gap-2 md:gap-2.5">
        <Icon name={icone} size={26} filled className={STATUS_META[status].text} />
        <h2 id={tituloId} className="m-0 font-display text-[19px] font-bold md:text-[22px]">
          {titulo}
        </h2>
        <span className="inline-flex h-[22px] items-center rounded-full bg-painel-3 px-2.5 text-xs font-bold text-texto-suave md:h-6 md:text-[13px]">
          {jogos.length}
        </span>
      </div>

      <ul
        aria-label={titulo}
        className={`scroll-row m-0 -mx-4 flex list-none snap-x scroll-px-4 gap-3.5 overflow-x-auto px-4 pb-1 pt-1.5 md:mx-0 md:grid md:overflow-visible md:px-0 md:scroll-px-0 md:pb-0 md:pt-0 ${
          compacta
            ? 'md:grid-cols-[repeat(auto-fill,120px)] md:gap-x-4 md:gap-y-5'
            : 'md:grid-cols-[repeat(auto-fill,150px)] md:gap-x-[22px] md:gap-y-6'
        }`}
      >
        {jogos.map((game) => (
          <GameTile
            key={game.id}
            game={game}
            onEdit={onEdit}
            onRemove={onRemove}
            compacta={compacta}
          />
        ))}
        <li data-adicionar className="shrink-0 snap-start">
          <button
            type="button"
            aria-label={`Adicionar em ${titulo}`}
            onClick={() => onAdicionar(status)}
            className={`${bloco} flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-borda-controle text-sm font-bold text-texto-suave transition-colors hover:border-destaque hover:bg-destaque/10 hover:text-texto md:rounded-[14px]`}
          >
            <Icon name="add" size={34} />
            Adicionar
          </button>
        </li>
      </ul>
    </section>
  );
}
