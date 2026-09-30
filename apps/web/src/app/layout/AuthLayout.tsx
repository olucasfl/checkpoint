import { Navigate, Outlet, useLocation, useSearchParams } from 'react-router-dom';
import { safeRedirect } from '@/features/auth/lib/safe-redirect';
import { useAuth } from '@/features/auth/session/use-auth';
import { Avisos } from '@/shared/components/Avisos';
import { ConnectionBanner } from '@/shared/components/ConnectionBanner';
import { UpdatePrompt } from '@/shared/components/UpdatePrompt';
import { Backdrop } from './Backdrop';
import { LoadingScreen } from './LoadingScreen';

/** Os links do e-mail funcionam com ou sem sessão (quem já está logado também pode abri-los). */
const ROTAS_ABERTAS_COM_SESSAO = ['/verificar-email', '/redefinir-senha'];

/**
 * Moldura de `/login`, `/registro` e das telas do e-mail: só o fundo Neon e o cartão central (sem barra de navegação).
 * Quem já tem sessão não vê estas telas: vai para o `?voltar=` (só no login, e só um caminho interno)
 * ou para `/`. É aqui que o login bem-sucedido redireciona: a sessão muda e este guard reage.
 */
export function AuthLayout() {
  const { status } = useAuth();
  const { pathname } = useLocation();
  const [params] = useSearchParams();

  if (status === 'carregando') {
    return <LoadingScreen />;
  }

  if (status === 'autenticado' && !ROTAS_ABERTAS_COM_SESSAO.includes(pathname)) {
    const isLogin = pathname.startsWith('/login');
    return <Navigate to={isLogin ? safeRedirect(params.get('voltar')) : '/'} replace />;
  }

  return (
    <div className="app-shell relative overflow-hidden">
      <Backdrop />
      <main className="safe-x relative grid min-h-dvh place-items-center py-10">
        <Outlet />
      </main>
      <ConnectionBanner />
      <Avisos />
      <UpdatePrompt />
    </div>
  );
}
