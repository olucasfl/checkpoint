import { useEffect, useState } from 'react';

/** Campo onde o teclado virtual abre: input de texto, select, textarea ou conteúdo editável. */
function isEditable(element: Element | null): boolean {
  if (!(element instanceof HTMLElement)) {
    return false;
  }
  if (element.isContentEditable) {
    return true;
  }
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
    return true;
  }
  if (element instanceof HTMLInputElement) {
    return !['button', 'checkbox', 'radio', 'submit', 'reset', 'file', 'range', 'color'].includes(
      element.type,
    );
  }
  return false;
}

function typingOutsideDialog(): boolean {
  const active = document.activeElement;
  return isEditable(active) && active?.closest('dialog') === null;
}

/**
 * `true` enquanto um campo editável FORA de um `<dialog>` está focado. Com o teclado virtual aberto
 * (e `interactive-widget=resizes-content`), um elemento fixo embaixo subiria junto e flutuaria sobre
 * o teclado; quem usa isto se esconde nesse intervalo. Dentro do diálogo modal a barra já fica
 * coberta.
 */
export function useTypingOutsideDialog(): boolean {
  const [typing, setTyping] = useState(typingOutsideDialog);

  useEffect(() => {
    // focusout dispara ANTES de o foco chegar ao próximo elemento: reavalia no próximo tick.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setTyping(typingOutsideDialog()), 0);
    };

    document.addEventListener('focusin', update);
    document.addEventListener('focusout', update);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', update);
    };
  }, []);

  return typing;
}
