import { type ReactNode } from 'react';
import { GAME_RATING_CRITERIA, type Game } from '@checkpoint/shared';
import { Icon } from '@/shared/components/Icon';
import { BlocoSteam } from '@/features/integracoes/components/BlocoSteam';
import { capasDoJogo } from '@/features/integracoes/lib/capa';
import { nomeDaPlataforma } from '../lib/estante';
import { platformIcon } from '../lib/status-meta';
import { AnelDeNota } from './AnelDeNota';
import { BarraDeCriterio } from './BarraDeCriterio';
import { GameCover } from './GameCover';
import { StatusBadge } from './StatusBadge';

interface GameDetailProps {
  game: Game;
  /** Editar e o convite "Adicionar descrição" abrem o mesmo formulário. */
  onEdit: () => void;
  onRemove: () => void;
  /** Ações extras da página (ex.: "Vincular à Steam"), ao lado de Editar e Excluir. */
  acoesExtras?: ReactNode;
}

const TITULO_SECAO = 'm-0 font-display text-lg font-bold';

/**
 * O corpo da página `/jogos/:id`, separado da página para ela cuidar só de carregar, editar e excluir. Em >= 1024 px a
 * capa em pé (300 × 400) fica ao lado do resto; abaixo disso a coluna é única. O bloco Steam (só com vínculo) vem por último.
 *
 * A descrição é texto digitado por quem usa o app, então entra como TEXTO: o React a escapa (um `<b>` ou
 * `<script>` aparece literal) e `whitespace-pre-line` preserva as quebras de linha, que é tudo o que a
 * descrição promete (sem Markdown nem HTML). `dangerouslySetInnerHTML` aqui abriria XSS.
 *
 * Cada critério mostra "sem nota" quando vazio, em vez de esconder a linha: o 0 é uma nota, e omitir o vazio
 * faria a lista mudar de tamanho conforme o que foi preenchido.
 */
export function GameDetail({ game, onEdit, onRemove, acoesExtras }: GameDetailProps) {
  const capas = capasDoJogo(game);
  const plataforma = game.plataforma?.trim() ? nomeDaPlataforma(game.plataforma.trim()) : null;

  return (
    <div className="flex flex-col gap-6 md:gap-8">
      <article
        aria-labelledby="detalhe-titulo"
        className="flex flex-col gap-6 lg:grid lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-10"
      >
        <div className="flex justify-center lg:block">
          <div className="w-full max-w-[300px] rounded-[20px] shadow-[0_24px_50px_color-mix(in_srgb,var(--color-fundo)_70%,transparent)]">
            <GameCover
              titulo={game.titulo}
              capaUrl={capas[0] ?? null}
              alternativas={capas.slice(1)}
              variant="detalhe"
            />
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
            <div className="flex min-w-0 flex-col gap-3.5">
              <h1
                id="detalhe-titulo"
                className="m-0 font-display text-[32px] font-extrabold leading-none tracking-[-0.02em] [overflow-wrap:anywhere] md:text-[52px]"
              >
                {game.titulo}
              </h1>
              <div className="flex flex-wrap items-center gap-2">
                {plataforma !== null && (
                  <span className="inline-flex h-[34px] items-center gap-1.5 rounded-full bg-painel-3 px-3.5 text-sm font-bold">
                    <Icon name={platformIcon(plataforma)} size={18} />
                    {plataforma}
                  </span>
                )}
                <StatusBadge status={game.status} />
              </div>
            </div>
            {game.notaMedia !== null ? (
              <AnelDeNota nota={game.notaMedia} tamanho="grande" />
            ) : (
              <p className="m-0 max-w-[220px] text-sm text-texto-suave">
                A nota geral é a média dos critérios que você preencher.
              </p>
            )}
          </header>

          <div data-acoes-do-jogo className="flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={onEdit}
              className="flex h-12 items-center gap-2 rounded-full bg-destaque px-[22px] font-display text-[15px] font-bold text-fundo transition-transform hover:-translate-y-0.5"
            >
              <Icon name="edit" size={20} />
              Editar
            </button>
            {acoesExtras}
            <button
              type="button"
              onClick={onRemove}
              className="flex h-12 items-center gap-2 rounded-full border border-borda-controle px-[22px] font-display text-[15px] font-bold text-erro-texto transition-colors hover:bg-painel-3"
            >
              <Icon name="delete" size={20} />
              Excluir
            </button>
          </div>

          <section
            aria-labelledby="detalhe-criterios"
            data-secao="criterios"
            className="flex flex-col gap-3.5 rounded-[18px] border border-borda bg-painel px-4 py-5 md:px-6"
          >
            <h2 id="detalhe-criterios" className={TITULO_SECAO}>
              Avaliação
            </h2>
            <ul aria-label="Notas por critério" className="m-0 flex list-none flex-col gap-3.5 p-0">
              {GAME_RATING_CRITERIA.map((criterio) => (
                <li
                  key={criterio.chave}
                  data-criterio={criterio.chave}
                  className="grid grid-cols-[minmax(0,1fr)_52px] items-center gap-x-4 gap-y-1.5 sm:grid-cols-[170px_minmax(0,1fr)_52px]"
                >
                  <div className="flex min-w-0 flex-col max-sm:col-span-2">
                    <span className="text-[15px] font-bold">{criterio.rotulo}</span>
                    <span className="text-xs font-medium text-texto-suave">
                      {criterio.descricao}
                    </span>
                  </div>
                  <BarraDeCriterio nota={game.notas[criterio.chave]} rotulo={criterio.rotulo} />
                </li>
              ))}
            </ul>
          </section>

          <section
            aria-labelledby="detalhe-descricao"
            data-secao="descricao"
            className="flex flex-col gap-1.5"
          >
            <h2 id="detalhe-descricao" className={TITULO_SECAO}>
              Descrição
            </h2>
            {game.descricao !== null ? (
              <p className="m-0 whitespace-pre-line text-base font-medium leading-normal [overflow-wrap:anywhere]">
                {game.descricao}
              </p>
            ) : (
              <button
                type="button"
                onClick={onEdit}
                className="flex min-h-11 items-center gap-2 self-start rounded-xl px-1 text-base font-semibold text-texto-suave underline underline-offset-4 hover:text-destaque"
              >
                <Icon name="add" size={20} />
                Adicionar descrição
              </button>
            )}
          </section>
        </div>
      </article>

      {game.dadosPlataforma.length > 0 && <BlocoSteam game={game} />}
    </div>
  );
}
