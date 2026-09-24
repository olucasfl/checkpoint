import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/features/auth/session/use-auth';
import { ListError } from '@/features/games/components/ListStates';
import { AppFrame } from './AppLayout';
import { LoadingScreen } from './LoadingScreen';

/**
 * Rota de layout das telas que exigem sessão:
 * - `carregando`: só o logo (o boot ainda não respondeu; nenhuma query da tela sai antes dele);
 * - `autenticado`: a rota;
 * - `visitante`: vai para `/login`, com `?voltar=` para a tela que tentou abrir e `?motivo=sessao` só
 *   se ele TINHA sessão e a perdeu (quem nunca entrou, ou saiu, não vê aviso);
 * - `desconectado`: a moldura do app com a mensagem de sem conexão, SEM redirecionar (sem rede o app
 *   não desloga ninguém).
 */
export function RequireAuth() {
  const { status, saida, recarregar } = useAuth();
  const location = useLocation();

  if (status === 'carregando') {
    return <LoadingScreen />;
  }

  if (status === 'desconectado') {
    return (
      <AppFrame>
        <main className="safe-x pb-12 pt-6 md:pt-10">
          <ListError offline onRetry={() => void recarregar()} />
        </main>
      </AppFrame>
    );
  }

  if (status === 'visitante') {
    const params = new URLSearchParams();
    if (saida === 'sessao') {
      params.set('motivo', 'sessao');
    }
    // Quem acabou de sair não precisa de "voltar": entrar de novo leva ao início.
    if (saida !== 'usuario') {
      params.set('voltar', `${location.pathname}${location.search}`);
    }
    const query = params.toString();
    return <Navigate to={query ? `/login?${query}` : '/login'} replace />;
  }

  return <Outlet />;
}
