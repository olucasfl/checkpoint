import { GAME_RATING_CRITERIA, type Game } from '@checkpoint/shared';
import { Icon } from '@/shared/components/Icon';
import { LABEL } from '@/shared/components/form-parts';
import { capasDoJogo } from '@/features/integracoes/lib/capa';
import { platformIcon } from '../lib/status-meta';
import { GameCover } from './GameCover';
import { RatingBar } from './RatingBar';
import { StatusBadge } from './StatusBadge';

interface GameDetailProps {
  game: Game;
  /** O convite "Adicionar descrição" abre o mesmo formulário do Editar. */
  onEdit: () => void;
}

/**
 * O corpo da página `/jogos/:id`, separado da página para ela cuidar só de carregar, editar e excluir.
 *
 * A descrição é texto digitado por quem usa o app, então entra como TEXTO: o React a escapa (um `<b>` ou
 * `<script>` aparece literal) e `whitespace-pre-line` preserva as quebras de linha, que é tudo o que a
 * descrição promete (sem Markdown nem HTML). `dangerouslySetInnerHTML` aqui abriria XSS.
 *
 * Cada critério mostra "sem nota" quando vazio, em vez de esconder a linha: o 0 é uma nota, e omitir o vazio
 * faria a lista mudar de tamanho conforme o que foi preenchido. No celular a coluna é única (a capa sozinha
 * já ocupa a largura); só a partir de 1024 px sobra espaço para a capa ao lado das notas.
 */
export function GameDetail({ game, onEdit }: GameDetailProps) {
  return (
    <article
      aria-labelledby="detalhe-titulo"
      className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-10"
    >
      <div className="flex justify-center lg:block lg:w-[320px] lg:shrink-0">
        <GameCover
          titulo={game.titulo}
          capaUrl={capasDoJogo(game)[0] ?? null}
          alternativas={capasDoJogo(game).slice(1)}
          variant="detalhe"
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-7">
        <header className="flex flex-col gap-2">
          <h1
            id="detalhe-titulo"
            className="m-0 font-display text-[26px] font-extrabold leading-tight tracking-[0.06em] [overflow-wrap:anywhere] md:text-[34px]"
          >
            {game.titulo}
          </h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {game.plataforma !== null && (
              <span className="flex items-center gap-1.5 text-[17px] font-medium text-texto-suave">
                <Icon name={platformIcon(game.plataforma)} size={20} />
                {game.plataforma}
              </span>
            )}
            <StatusBadge status={game.status} />
          </div>
        </header>

        <section
          aria-labelledby="detalhe-media"
          data-secao="media"
          className="flex flex-col gap-3 rounded-2xl bg-painel p-4 md:p-5"
        >
          <h2 id="detalhe-media" className={`m-0 ${LABEL}`}>
            Nota geral
          </h2>
          <RatingBar nota={game.notaMedia} tamanho="grande" vazio="texto" />
          {game.notaMedia === null && (
            <p className="m-0 text-[16px] text-texto-suave">
              A nota geral é a média dos critérios que você preencher.
            </p>
          )}
        </section>

        <section
          aria-labelledby="detalhe-criterios"
          data-secao="criterios"
          className="flex flex-col gap-2"
        >
          <h2 id="detalhe-criterios" className={`m-0 ${LABEL}`}>
            Avaliação
          </h2>
          <ul
            aria-label="Notas por critério"
            className="m-0 flex list-none flex-col divide-y divide-borda p-0"
          >
            {GAME_RATING_CRITERIA.map((criterio) => (
              <li
                key={criterio.chave}
                data-criterio={criterio.chave}
                className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="text-[18px] font-semibold">{criterio.rotulo}</span>
                  <span className="text-[15px] text-texto-suave">{criterio.descricao}</span>
                </div>
                <div className="shrink-0">
                  <RatingBar
                    nota={game.notas[criterio.chave]}
                    rotulo={criterio.rotulo}
                    vazio="texto"
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section
          aria-labelledby="detalhe-descricao"
          data-secao="descricao"
          className="flex flex-col gap-2"
        >
          <h2 id="detalhe-descricao" className={`m-0 ${LABEL}`}>
            Descrição
          </h2>
          {game.descricao !== null ? (
            <p className="m-0 whitespace-pre-line text-[18px] leading-relaxed [overflow-wrap:anywhere]">
              {game.descricao}
            </p>
          ) : (
            <button
              type="button"
              onClick={onEdit}
              className="flex min-h-11 items-center gap-2 self-start rounded-xl px-1 text-[17px] font-semibold text-texto-suave underline underline-offset-4 hover:text-ciano"
            >
              <Icon name="add" size={20} />
              Adicionar descrição
            </button>
          )}
        </section>
      </div>
    </article>
  );
}
