import { act, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ModalDialog } from './ModalDialog';

/**
 * Regressão: "Buscar na Steam" é um diálogo dentro do "Novo jogo". O `close` do interno chegava ao `onClose` do
 * externo (o React propaga o evento pela árvore de componentes) e o formulário inteiro fechava junto, com o que
 * a pessoa já tinha preenchido.
 */
function DoisDialogos({ onCloseExterno }: { onCloseExterno: () => void }) {
  const [interno, setInterno] = useState(true);
  return (
    <ModalDialog open onClose={onCloseExterno} labelledBy="externo">
      <h2 id="externo">Externo</h2>
      <ModalDialog open={interno} onClose={() => setInterno(false)} labelledBy="interno">
        <h2 id="interno">Interno</h2>
        <button type="button" onClick={() => setInterno(false)}>
          Fechar interno
        </button>
      </ModalDialog>
    </ModalDialog>
  );
}

describe('ModalDialog', () => {
  it('fechar o diálogo interno não fecha o externo', () => {
    const onCloseExterno = vi.fn();
    render(<DoisDialogos onCloseExterno={onCloseExterno} />);

    act(() => {
      screen.getByRole('button', { name: 'Fechar interno', hidden: true }).click();
    });

    expect(onCloseExterno).not.toHaveBeenCalled();
  });

  it('o próprio diálogo ainda avisa quando fecha', () => {
    const onClose = vi.fn();
    const { container } = render(
      <ModalDialog open onClose={onClose} labelledBy="t">
        <h2 id="t">Título</h2>
      </ModalDialog>,
    );

    act(() => {
      container.querySelector('dialog')?.close();
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
