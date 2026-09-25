import { type ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import { ConnectionBanner } from '@/shared/components/ConnectionBanner';
import { InstallNudge } from '@/shared/components/InstallNudge';
import { UpdatePrompt } from '@/shared/components/UpdatePrompt';
import { Backdrop } from './Backdrop';
import { BottomNav } from './BottomNav';
import { TopNav } from './TopNav';

/**
 * A moldura das telas do app: fundo (halo estático), navegação do topo (>= 768px), o conteúdo
 * e a barra inferior (< 768px). Fora do `AppLayout` para o `RequireAuth` poder mostrar a moldura com
 * uma mensagem (sem conexão) no lugar da rota.
 */
export function AppFrame({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell relative overflow-hidden">
      <Backdrop />

      <div className="nav-clearance relative">
        <TopNav />
        {children}
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
