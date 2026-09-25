import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/shared/components/Icon';
import { OverlayPortal } from '@/shared/components/OverlayPortal';
import { useConnectivity } from '@/shared/hooks/use-connectivity';
import { connectivity, type ConnectionState } from '@/shared/lib/connectivity';

/** Quanto tempo "Conexão restabelecida" fica na tela. */
export const RESTORED_VISIBLE_MS = 3_000;

const BOX =
  'banner-in pointer-events-auto mx-auto flex max-w-[640px] items-center gap-3 rounded-md border bg-painel px-3.5 py-2.5 text-[16px] text-texto';

/**
 * Aviso de conexão no topo, no `#overlay-root`. O contêiner `role="status"` existe SEMPRE (vazio
 * quando está tudo bem): uma região viva que já nasce com texto costuma não ser anunciada, e o
 * texto que entra depois dela é. Fica abaixo da área segura do topo e nunca chega à barra inferior.
 */
export function ConnectionBanner() {
  const state = useConnectivity();
  const previous = useRef<ConnectionState>(state);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    const before = previous.current;
    previous.current = state;

    if (state !== 'online') {
      setRestored(false);
      return undefined;
    }
    if (before === 'online') {
      return undefined;
    }

    setRestored(true);
    const timer = setTimeout(() => setRestored(false), RESTORED_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [state]);

  return (
    <OverlayPortal>
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 z-50 px-4"
        style={{ top: 'calc(env(safe-area-inset-top) + 8px)' }}
      >
        {state === 'offline' && (
          <div className={`${BOX} border-erro`} data-connection="offline">
            <Icon name="wifi_off" size={22} filled className="text-erro" />
            <span>Você está offline. O que já está na tela continua visível.</span>
          </div>
        )}

        {state === 'sem-servidor' && (
          <div className={`${BOX} border-erro`} data-connection="sem-servidor">
            <Icon name="cloud_off" size={22} filled className="text-erro" />
            <span className="flex-1">Não foi possível falar com o servidor. Tentando de novo…</span>
            <button
              type="button"
              onClick={() => connectivity.retryNow()}
              className="min-h-11 shrink-0 rounded-[4px] border border-borda-controle px-3.5 font-display text-[13px] font-semibold tracking-[0.1em] uppercase hover:bg-acao-hover"
            >
              Tentar agora
            </button>
          </div>
        )}

        {state === 'online' && restored && (
          <div className={`${BOX} border-destaque`} data-connection="restored">
            <Icon name="wifi" size={22} filled className="text-destaque" />
            <span>Conexão restabelecida</span>
          </div>
        )}
      </div>
    </OverlayPortal>
  );
}
