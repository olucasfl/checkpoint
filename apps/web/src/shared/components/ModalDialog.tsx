import { useEffect, useRef, type ReactNode } from 'react';

interface ModalDialogProps {
  open: boolean;
  /** Chamado quando o diálogo fecha por qualquer caminho, inclusive Esc (nativo). */
  onClose: () => void;
  /** id do título dentro do diálogo. */
  labelledBy: string;
  children: ReactNode;
}

/**
 * `<dialog>` nativo aberto com `showModal()`: o Esc fecha, o foco fica preso dentro e volta ao botão
 * que abriu, tudo sem biblioteca. O conteúdo só existe enquanto aberto, então cada abertura começa
 * com o formulário limpo. O tamanho e a posição vêm da classe `.modal` (styles/index.css): folha
 * inferior em tela estreita, centralizado em >= 768px.
 */
export function ModalDialog({ open, onClose, labelledBy, children }: ModalDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) {
      return;
    }
    if (open && !dialog.open) {
      dialog.showModal();
      // O `autoFocus` do React roda com o diálogo ainda fechado (display: none) e não tem efeito;
      // sem isto o foco cai no primeiro focável (o botão Fechar) e um espaço digitado o clica.
      dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      onClose={onClose}
      className="modal glow-dialog border border-magenta bg-painel p-0 text-texto"
    >
      {open ? children : null}
    </dialog>
  );
}
