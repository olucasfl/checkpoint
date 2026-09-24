import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

/** Intervalo entre buscas por versão nova enquanto a aba está aberta e visível. */
const CHECK_EVERY_MS = 60 * 60 * 1000;

export interface AppUpdate {
  /** Há uma versão nova esperando e o usuário ainda não adiou. */
  precisaAtualizar: boolean;
  /** Ativa a versão nova e recarrega a página (o único recarregamento do app). */
  atualizar: () => void;
  /** Esconde o aviso até o próximo carregamento da página. */
  adiar: () => void;
}

/**
 * Único ponto do app que conhece o módulo virtual do plugin de PWA (os testes mockam ESTE arquivo).
 * Sem SW no `npm run dev`: lá o módulo virtual é inerte e `precisaAtualizar` fica falso.
 */
export function useAppUpdate(): AppUpdate {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | undefined>();
  const [adiado, setAdiado] = useState(false);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW: (_url, registered) => setRegistration(registered),
  });

  useEffect(() => {
    if (!registration) {
      return undefined;
    }

    const check = () => {
      // Aba escondida não gasta rede; ao voltar a ficar visível, o evento abaixo checa na hora.
      if (document.visibilityState === 'visible') {
        registration.update().catch(() => undefined); // offline: tenta na próxima
      }
    };

    check();
    const timer = setInterval(check, CHECK_EVERY_MS);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
    };
  }, [registration]);

  return {
    precisaAtualizar: needRefresh && !adiado,
    atualizar: () => void updateServiceWorker(true),
    adiar: () => setAdiado(true),
  };
}
