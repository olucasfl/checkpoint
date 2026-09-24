import { useEffect } from 'react';
import { Icon } from '@/shared/components/Icon';
import { OverlayPortal } from '@/shared/components/OverlayPortal';
import { useDialogOpen } from '@/shared/hooks/use-dialog-open';
import { setUpdatePromptVisivel } from '@/shared/lib/pwa/update-prompt-visibility';
import { useAppUpdate } from '@/shared/lib/pwa/use-app-update';

/**
 * Aviso de versão nova. Não modal e sem diálogo nativo de confirmação: o usuário decide quando trocar de versão. A
 * região `role="status"` existe sempre (vazia sem aviso), porque uma região viva que já nasce com
 * texto costuma não ser anunciada. Some enquanto há um diálogo aberto, para nunca disputar a
 * atenção com um formulário, e volta quando ele fecha.
 */
export function UpdatePrompt() {
  const { precisaAtualizar, atualizar, adiar } = useAppUpdate();
  const dialogOpen = useDialogOpen();
  const visivel = precisaAtualizar && !dialogOpen;

  // O convite de instalação espera enquanto este aviso está na tela.
  useEffect(() => {
    setUpdatePromptVisivel(visivel);
    return () => setUpdatePromptVisivel(false);
  }, [visivel]);

  return (
    <OverlayPortal>
      <div
        role="status"
        aria-live="polite"
        className="update-prompt pointer-events-none fixed z-40"
      >
        {visivel && (
          <div className="update-in pointer-events-auto flex items-center gap-3 rounded-md border border-ciano bg-painel px-3.5 py-2.5 text-[16px] text-texto">
            <Icon name="system_update" size={22} filled className="text-ciano" />
            <span className="flex-1">Nova versão disponível</span>
            <button
              type="button"
              onClick={atualizar}
              className="min-h-11 shrink-0 rounded-[4px] bg-ciano px-3.5 font-display text-[13px] font-extrabold uppercase tracking-[0.1em] text-fundo"
            >
              Atualizar
            </button>
            <button
              type="button"
              onClick={adiar}
              className="min-h-11 shrink-0 rounded-[4px] border border-borda-controle px-3.5 font-display text-[13px] font-semibold uppercase tracking-[0.1em] hover:bg-acao-hover"
            >
              Depois
            </button>
          </div>
        )}
      </div>
    </OverlayPortal>
  );
}
