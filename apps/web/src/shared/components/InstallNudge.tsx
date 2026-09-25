import { useEffect, useReducer, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Icon } from '@/shared/components/Icon';
import { OverlayPortal } from '@/shared/components/OverlayPortal';
import { useDialogOpen } from '@/shared/hooks/use-dialog-open';
import { ehSafariIos, estaInstalado } from '@/shared/lib/pwa/display';
import { DIAS_DE_USO, DISPENSADO_EM, INSTALADO } from '@/shared/lib/pwa/install-keys';
import { assinar, pedirInstalacao, podeInstalar } from '@/shared/lib/pwa/install-prompt';
import { useUpdatePromptVisivel } from '@/shared/lib/pwa/update-prompt-visibility';
import { storage } from '@/shared/lib/storage/storage';

/** Espera depois de a página carregar: o convite não disputa a atenção com a primeira tela. */
export const NUDGE_DELAY_MS = 4_000;
/** Depois de um "Agora não", o convite só volta após este tempo. */
export const DISMISS_QUIET_MS = 14 * 24 * 60 * 60 * 1000;
/** Só convida quem já voltou: o app foi aberto em pelo menos estes dias diferentes. */
const MIN_DAYS_OF_USE = 2;

/** Telas de entrada: convidar a instalar ali atrapalha o que a pessoa veio fazer. */
const AUTH_ROUTES = /^\/(login|registro)(\/|$)/;

const BUTTON =
  'min-h-11 shrink-0 rounded-[4px] px-3.5 font-display text-[13px] uppercase tracking-[0.1em]';

/**
 * Convite para instalar o app, no `#overlay-root`. Não modal e só aparece quando TODAS as condições da
 * spec valem. A região `role="status"` existe sempre (vazia sem convite): uma região viva que já
 * nasce com texto costuma não ser anunciada.
 */
export function InstallNudge() {
  const { pathname } = useLocation();
  const dialogOpen = useDialogOpen();
  const updateVisible = useUpdatePromptVisivel();
  const [pronto, setPronto] = useState(false);
  const [oculto, setOculto] = useState(false);
  // O convite nativo pode chegar depois do render, e o `appinstalled` a qualquer momento.
  const [, atualizar] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    const timer = setTimeout(() => setPronto(true), NUDGE_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => assinar(atualizar), []);

  const nativo = podeInstalar();
  const ios = !nativo && ehSafariIos();
  const dispensadoEm = storage.get(DISPENSADO_EM);

  const mostrar =
    pronto &&
    !oculto &&
    !updateVisible &&
    !dialogOpen &&
    !AUTH_ROUTES.test(pathname) &&
    !estaInstalado() &&
    !storage.get(INSTALADO) &&
    (nativo || ios) &&
    storage.get(DIAS_DE_USO).total >= MIN_DAYS_OF_USE &&
    (dispensadoEm === null || Date.now() - dispensadoEm >= DISMISS_QUIET_MS);

  function dispensar() {
    storage.set(DISPENSADO_EM, Date.now());
    setOculto(true);
  }

  async function instalar() {
    const resultado = await pedirInstalacao();
    if (resultado === 'recusado') {
      dispensar();
    } else if (resultado === 'aceito') {
      setOculto(true);
    }
  }

  return (
    <OverlayPortal>
      <div
        role="status"
        aria-live="polite"
        className="install-nudge pointer-events-none fixed z-40"
      >
        {mostrar && (
          <div className="update-in pointer-events-auto flex items-center gap-3 rounded-md border border-destaque bg-painel px-3.5 py-2.5 text-[16px] text-texto">
            <Icon
              name={ios ? 'add_to_home_screen' : 'install_mobile'}
              size={22}
              filled
              className="text-destaque"
            />
            <span className="flex-1">
              {ios ? (
                <>
                  Para instalar: toque em Compartilhar (ícone{' '}
                  <Icon name="ios_share" size={18} className="align-middle" />) e depois em{' '}
                  <em>Adicionar à Tela de Início</em>.
                </>
              ) : (
                'Instale o checkpoint para abrir direto da tela inicial, em tela cheia.'
              )}
            </span>
            {!ios && (
              <button
                type="button"
                onClick={() => void instalar()}
                className={`${BUTTON} bg-destaque font-extrabold text-fundo`}
              >
                Instalar
              </button>
            )}
            <button
              type="button"
              onClick={dispensar}
              className={`${BUTTON} border border-borda-controle font-semibold hover:bg-acao-hover`}
            >
              {ios ? 'Entendi' : 'Agora não'}
            </button>
          </div>
        )}
      </div>
    </OverlayPortal>
  );
}
