import { type ReactNode } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { ConnectionBanner } from '@/shared/components/ConnectionBanner';
import { ErrorBoundary } from '@/shared/components/ErrorBoundary';
import { InstallNudge } from '@/shared/components/InstallNudge';
import { UpdatePrompt } from '@/shared/components/UpdatePrompt';
import { Backdrop } from './Backdrop';
import { BottomNav } from './BottomNav';
import { TopNav } from './TopNav';

/**
 * A moldura das telas do app: fundo (halo estático), navegação do topo (>= 768px), o conteúdo
 * e a barra inferior (< 768px). Fora do `AppLayout` para o `RequireAuth` poder mostrar a moldura com
 * uma mensagem (sem conexão) no lugar da rota. O conteúdo fica num `ErrorBoundary` (que esquece o erro ao trocar de
 * rota): uma tela que lança no render mostra o erro e deixa a navegação viva, em vez de derrubar o app inteiro.
 */
export function AppFrame({ children }: { children: ReactNode }) {
  const { pathname, search } = useLocation();
  return (
    <div className="app-shell relative overflow-hidden">
      <Backdrop />

      <div className="nav-clearance relative">
        <TopNav />
        <ErrorBoundary resetKey={`${pathname}${search}`}>{children}</ErrorBoundary>
      </div>

      <BottomNav />
      <ConnectionBanner />
      <UpdatePrompt />
      <InstallNudge />
    </div>
  );
}

/** Layout de todas as telas logadas e do `/status`. Nenhuma página importa a navegação à mão. */
export function AppLayout() {
  return (
    <AppFrame>
      <Outlet />
    </AppFrame>
  );
}
