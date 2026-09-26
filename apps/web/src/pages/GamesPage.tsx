import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { type Game, type GameStatus } from '@checkpoint/shared';
import { Chek } from '@/shared/components/Chek/Chek';
import { Icon } from '@/shared/components/Icon';
import { ModalDialog } from '@/shared/components/ModalDialog';
import { useConnectivity } from '@/shared/hooks/use-connectivity';
import { usePrefs } from '@/shared/hooks/use-prefs';
import { useGames } from '@/features/games/api/use-games';
import { DeleteGameDialog } from '@/features/games/components/DeleteGameDialog';
import { DestaqueContinue } from '@/features/games/components/DestaqueContinue';
import { GameForm } from '@/features/games/components/GameForm';
import { ListEmpty, ListError, ListLoading } from '@/features/games/components/ListStates';
import { Prateleira } from '@/features/games/components/Prateleira';
import { StatusFilter } from '@/features/games/components/StatusFilter';
import { countByStatus } from '@/features/games/lib/count-by-status';
import { agruparEmPrateleiras, destaqueDoCatalogo } from '@/features/games/lib/estante';
import { comFiltroInicial, paramsDoFiltro } from '@/features/games/lib/initial-filter';
import { wantsNewGame, withoutNewGameParam } from '@/features/games/lib/new-game';
import { parseStatusFilter, type StatusFilter as Filter } from '@/features/games/lib/status-filter';
import { useMovimentoReduzido } from '@/shared/hooks/use-movimento-reduzido';
import { avisarDoSalvar } from '@/features/games/lib/avisar-do-salvar';

/** Estado do diálogo: fechado, novo jogo (com o status da prateleira que o abriu, se veio de uma) ou edição. */
type FormDialog = { open: false } | { open: true; game?: Game; status?: GameStatus };

/**
 * Catálogo de jogos (rota `/`): a estante. Busca a lista COMPLETA uma vez; o filtro (na URL, `/?status=`), as contagens,
 * o destaque e as prateleiras saem dela, no cliente. A barra superior é desta página (o `TopNav` não renderiza em `/`):
 * logo, filtros, "Adicionar jogo" e "Perfil" no desktop; no celular, logo e filtros (Adicionar e Perfil ficam na
 * barra inferior).
 */
export function GamesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { filtroInicial, densidade } = usePrefs();
  // Sem `?status=`, já filtra pelo inicial no 1º render (a URL é acertada logo abaixo): a lista
  // inteira não pisca antes do filtro.
  const filter = searchParams.has('status')
    ? parseStatusFilter(searchParams.get('status'))
    : filtroInicial;
  const { data, isPending, isError, refetch } = useGames();
  const connection = useConnectivity();
  const [form, setForm] = useState<FormDialog>({ open: false });
  const [toDelete, setToDelete] = useState<Game | null>(null);

  const games = useMemo(() => data ?? [], [data]);
  const counts = useMemo(() => countByStatus(games), [games]);
  const prateleiras = useMemo(() => agruparEmPrateleiras(games, filter), [games, filter]);
  const destaque = useMemo(() => destaqueDoCatalogo(games, filter), [games, filter]);

  // Um efeito só acerta a URL (com `replace`, para o "voltar" não voltar a ela): `/?novo=1` abre o
  // formulário e sai da URL (reload não o reabre), e `/` sem `?status=` ganha o filtro inicial do
  // /perfil. Dois `setSearchParams` seguidos se sobrescreveriam.
  useEffect(() => {
    let next = searchParams;
    if (wantsNewGame(next)) {
      setForm({ open: true });
      next = withoutNewGameParam(next);
    }
    next = comFiltroInicial(next, filtroInicial) ?? next;
    if (next !== searchParams) {
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams, filtroInicial]);

  // O jogo recém-criado: assenta, ganha um anel por 2 s (`--mov-realce`) e a página rola até ele se estiver fora da vista.
  const [novoId, setNovoId] = useState<string | null>(null);
  const jaRolou = useRef<string | null>(null);
  const reduzido = useMovimentoReduzido();
  // Quantos jogos havia quando o formulário abriu (o "primeiro jogo" vale para a lista vazia de ANTES do salvar).
  const jogosAoAbrir = useRef(0);

  useEffect(() => {
    if (form.open) {
      jogosAoAbrir.current = games.length;
    }
    // Só a abertura importa: a lista muda depois do salvar e não pode reescrever o "antes".
  }, [form.open]);

  useEffect(() => {
    if (!novoId) {
      return undefined;
    }
    const timer = setTimeout(() => setNovoId(null), 2_000);
    return () => clearTimeout(timer);
  }, [novoId]);

  useEffect(() => {
    if (!novoId || jaRolou.current === novoId) {
      return;
    }
    const tile = [...document.querySelectorAll<HTMLElement>('[data-flip-id]')].find(
      (el) => el.dataset.flipId === novoId,
    );
    if (!tile) {
      return;
    }
    jaRolou.current = novoId;
    const caixa = tile.getBoundingClientRect();
    // A barra inferior (68 px) cobre o pé da tela no celular: o que fica atrás dela não está à vista.
    if (caixa.top < 0 || caixa.bottom > window.innerHeight - 80) {
      tile.scrollIntoView?.({ block: 'center', behavior: reduzido ? 'auto' : 'smooth' });
    }
  }, [novoId, games, reduzido]);

  function changeFilter(next: Filter) {
    setSearchParams(paramsDoFiltro(next, filtroInicial));
  }

  return (
    <div className="safe-x pb-12 pt-4 md:pb-16 md:pt-6">
      <div className="relative mx-auto flex max-w-[1168px] flex-col gap-5 md:gap-7">
        <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-4">
          <div className="flex items-center justify-between md:contents">
            <Link
              to="/"
              aria-current="page"
              className="flex min-h-11 shrink-0 items-center gap-2.5 font-display text-xl font-extrabold tracking-[-0.01em] text-texto no-underline md:text-[22px]"
            >
              <Chek className="h-9 w-auto md:h-11" />
              Checkpoint
            </Link>
          </div>

          <StatusFilter filter={filter} counts={counts} onChange={changeFilter} />

          {/* No celular, "Adicionar" e "Perfil" ficam na barra inferior. */}
          <div className="hidden shrink-0 items-center gap-2 md:flex">
            <button
              type="button"
              onClick={() => setForm({ open: true })}
              className="flex h-11 items-center gap-2 rounded-full bg-destaque px-5 font-display text-[15px] font-bold text-fundo transition-transform hover:-translate-y-0.5"
            >
              <Icon name="add" size={22} />
              Adicionar jogo
            </button>
            <Link
              to="/perfil"
              aria-label="Perfil"
              className="grid size-11 place-items-center rounded-full border border-borda-controle bg-painel text-texto-suave no-underline transition-colors hover:text-texto"
            >
              <Icon name="person" size={22} />
            </Link>
          </div>
        </header>

        <main className="flex flex-col gap-7 md:gap-9">
          <h1 className="sr-only">Seus jogos</h1>

          {isPending && <ListLoading />}
          {/* Com a lista já carregada, um refetch que falha não a esconde (spec, "Catálogo sem conexão"). */}
          {isError && data === undefined && (
            <ListError onRetry={() => void refetch()} offline={connection !== 'online'} />
          )}
          {!isPending && data !== undefined && prateleiras.length === 0 && (
            <ListEmpty filtered={filter !== 'TODOS' && games.length > 0} />
          )}

          {destaque && <DestaqueContinue game={destaque} />}
          {prateleiras.map((prateleira) => (
            <Prateleira
              key={prateleira.status}
              status={prateleira.status}
              titulo={prateleira.titulo}
              icone={prateleira.icone}
              jogos={prateleira.jogos}
              onEdit={(target) => setForm({ open: true, game: target })}
              onRemove={setToDelete}
              onAdicionar={(status) => setForm({ open: true, status })}
              compacta={densidade === 'compacta'}
              novoId={novoId}
              onVerMais={filter === 'TODOS' ? changeFilter : undefined}
            />
          ))}
        </main>
      </div>

      <ModalDialog
        open={form.open}
        onClose={() => setForm({ open: false })}
        labelledBy="game-dialog-title"
      >
        {form.open && (
          <GameForm
            game={form.game}
            statusInicial={form.status}
            onDone={(resultado) => {
              setForm({ open: false });
              avisarDoSalvar(resultado, {
                anterior: form.game,
                listaVazia: jogosAoAbrir.current === 0,
                filtro: filter,
                aoVer: changeFilter,
              });
              if (resultado?.criado && (filter === 'TODOS' || filter === resultado.jogo.status)) {
                setNovoId(resultado.jogo.id);
              }
            }}
            onCancel={() => setForm({ open: false })}
            onLinkedExisting={(jogoId) => {
              setForm({ open: false });
              navigate(`/jogos/${jogoId}`);
            }}
          />
        )}
      </ModalDialog>

      <DeleteGameDialog game={toDelete} onClose={() => setToDelete(null)} />
    </div>
  );
}
