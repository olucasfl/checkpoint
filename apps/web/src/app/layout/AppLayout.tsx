import { Outlet } from 'react-router-dom';
import { ConnectionBanner } from '@/shared/components/ConnectionBanner';
import { UpdatePrompt } from '@/shared/components/UpdatePrompt';
import { BottomNav } from './BottomNav';
import { TopNav } from './TopNav';

/**
 * Layout de todas as telas do app: fundo Neon (orbes + scanlines), navegação do topo (>= 768px), o
 * conteúdo da rota e a barra inferior (< 768px). Nenhuma página importa a navegação à mão.
 */
export function AppLayout() {
  return (
    <div className="app-shell relative overflow-hidden">
      <div
        aria-hidden="true"
        className="orb orb-magenta -right-[160px] -top-[200px] size-[420px] md:-right-[220px] md:-top-[280px] md:size-[720px]"
      />
      <div
        aria-hidden="true"
        className="orb orb-ciano -bottom-[220px] -left-[180px] size-[420px] md:-bottom-[320px] md:-left-[260px] md:size-[760px]"
      />
      <div aria-hidden="true" className="scanlines" />

      <div className="nav-clearance relative">
        <TopNav />
        <Outlet />
      </div>

      <BottomNav />
      <ConnectionBanner />
      <UpdatePrompt />
    </div>
  );
}
