import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Icon } from '@/shared/components/Icon';
import { ModalDialog } from '@/shared/components/ModalDialog';
import { useConnectivity } from '@/shared/hooks/use-connectivity';
import { useGames } from '@/features/games/api/use-games';
import { DeleteGameDialog } from '@/features/games/components/DeleteGameDialog';
import { DetailLoading, GameNotFound } from '@/features/games/components/DetailStates';
import { GameDetail } from '@/features/games/components/GameDetail';
import { GameForm } from '@/features/games/components/GameForm';
import { useTemContaSteam } from '@/features/integracoes/api/use-integracoes';
import { BibliotecaSteamDialog } from '@/features/integracoes/components/BibliotecaSteamDialog';
import { ListError } from '@/features/games/components/ListStates';

/**
 * `/jogos/:id` (spec avaliacao-de-jogos, etapa 3). Não há rota nova na API: o jogo é achado na query `['games']`
 * que o catálogo já usa (a lista de uma pessoa é pequena). Carregando: esqueleto. Id inexistente ou de outro
 * usuário: "Jogo não encontrado". Editar abre o mesmo `GameForm` do catálogo no `ModalDialog`, e Excluir usa a
 * confirmação que já existe (e volta ao catálogo).
 */
export function GameDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const connection = useConnectivity();
  const { data, isPending, isError, refetch } = useGames();
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [vinculando, setVinculando] = useState(false);
  const temContaSteam = useTemContaSteam();

  const game = data?.find((candidate) => candidate.id === id);

  // Voltar desfaz a navegação quando ela veio do app (o catálogo reaparece com o filtro que estava); num
  // link direto (`key` "default", sem histórico do app) vai ao catálogo.
  function voltar() {
    if (location.key !== 'default') {
      navigate(-1);
    } else {
      navigate('/');
    }
  }

  return (
    <div className="safe-x pb-24 pt-6 md:pb-16 md:pt-10">
      <main className="relative mx-auto flex max-w-[1168px] flex-col gap-6">
        <button
          type="button"
          onClick={voltar}
          className="flex min-h-11 items-center gap-1.5 self-start rounded-full px-1 font-bold text-texto-suave transition-colors hover:text-texto"
        >
          <Icon name="arrow_back" size={20} />
          Voltar
        </button>

        {game && temContaSteam === false && game.dadosPlataforma.length === 0 && (
          <p className="m-0 text-[16px] text-texto-suave">
            <Link to="/perfil" className="font-semibold text-destaque underline">
              Vincule sua Steam no perfil
            </Link>{' '}
            para ligar este jogo à sua biblioteca.
          </p>
        )}

        {isPending && <DetailLoading />}
        {/* Com a lista já carregada, um refetch que falha não esconde o jogo. */}
        {isError && data === undefined && (
          <ListError onRetry={() => void refetch()} offline={connection !== 'online'} />
        )}
        {data !== undefined && !game && <GameNotFound />}
        {game && (
          <GameDetail
            game={game}
            onEdit={() => setEditing(true)}
            onRemove={() => setRemoving(true)}
            acoesExtras={
              temContaSteam === true && game.dadosPlataforma.length === 0 ? (
                <button
                  type="button"
                  onClick={() => setVinculando(true)}
                  className="flex h-12 items-center gap-2 rounded-full border border-borda-controle px-[22px] font-display text-[15px] font-bold transition-colors hover:bg-painel-3"
                >
                  <Icon name="link" size={20} />
                  Vincular à Steam
                </button>
              ) : null
            }
          />
        )}
      </main>

      <ModalDialog open={editing} onClose={() => setEditing(false)} labelledBy="game-dialog-title">
        {editing && game && (
          <GameForm
            game={game}
            onDone={() => setEditing(false)}
            onCancel={() => setEditing(false)}
          />
        )}
      </ModalDialog>

      {game && (
        <BibliotecaSteamDialog
          open={vinculando}
          modo={{ tipo: 'vincular', jogo: game }}
          onClose={() => setVinculando(false)}
          onVinculado={() => setVinculando(false)}
        />
      )}

      <DeleteGameDialog
        game={removing ? (game ?? null) : null}
        onClose={() => setRemoving(false)}
        onDeleted={() => navigate('/', { replace: true })}
      />
    </div>
  );
}
