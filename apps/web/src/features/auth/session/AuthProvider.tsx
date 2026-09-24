import { useEffect, type ReactNode } from 'react';
import { connectivity } from '@/shared/lib/connectivity';
import { boot, getSession, listenToOtherTabs } from './session';

/**
 * Liga a sessão ao ciclo de vida do app: recupera a sessão ao carregar (antes de qualquer query, porque
 * o `RequireAuth` segura as telas até o boot responder), tenta de novo quando a conectividade volta e
 * escuta o logout das outras abas.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    void boot();
  }, []);

  useEffect(
    () =>
      connectivity.subscribe(() => {
        // Sem rede no boot o app fica `desconectado`; ao voltar, refaz o refresh sozinho.
        if (connectivity.getState() === 'online' && getSession().status === 'desconectado') {
          void boot();
        }
      }),
    [],
  );

  useEffect(() => listenToOtherTabs(), []);

  return <>{children}</>;
}
