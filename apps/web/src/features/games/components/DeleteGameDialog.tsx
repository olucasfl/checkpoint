import { useState } from 'react';
import { type Game } from '@checkpoint/shared';
import { Icon } from '@/shared/components/Icon';
import { ModalDialog } from '@/shared/components/ModalDialog';
import { useDeleteGame } from '../api/use-games';
import { describeError } from '../lib/api-error';
import { FieldError } from '@/shared/components/form-parts';

interface DeleteGameDialogProps {
  /** Jogo a remover; `null` = diálogo fechado. */
  game: Game | null;
  onClose: () => void;
}

/** Confirmação antes de remover (a remoção é definitiva, sem lixeira). */
export function DeleteGameDialog({ game, onClose }: DeleteGameDialogProps) {
  const mutation = useDeleteGame();
  const [error, setError] = useState('');

  async function confirmarRemocao() {
    if (!game) {
      return;
    }
    setError('');
    try {
      await mutation.mutateAsync(game.id);
      onClose();
    } catch (failure) {
      setError(describeError(failure).message);
    }
  }

  return (
    <ModalDialog open={game !== null} onClose={onClose} labelledBy="delete-dialog-title">
      <div className="sheet-pad flex flex-col gap-5 px-7 pt-7">
        <h2
          id="delete-dialog-title"
          className="m-0 flex items-center gap-2.5 font-display text-xl font-extrabold tracking-[0.12em]"
        >
          <Icon name="delete" size={26} filled className="text-erro" />
          REMOVER JOGO
        </h2>
        <p className="m-0 text-[19px]">
          Remover <strong>{game?.titulo}</strong>? Esta ação é definitiva e apaga também a capa.
        </p>
        <FieldError id="delete-error" message={error} />
        <div className="flex justify-end gap-2.5">
          <button
            type="button"
            data-autofocus
            onClick={onClose}
            className="min-h-12 rounded-[4px] border border-borda-controle px-5 font-display text-[13px] font-semibold tracking-[0.1em] hover:bg-acao-hover"
          >
            CANCELAR
          </button>
          <button
            type="button"
            onClick={confirmarRemocao}
            disabled={mutation.isPending}
            className="min-h-12 rounded-[4px] bg-erro px-[22px] font-display text-[13px] font-extrabold tracking-[0.1em] text-fundo disabled:opacity-70"
          >
            {mutation.isPending ? 'REMOVENDO…' : 'REMOVER'}
          </button>
        </div>
      </div>
    </ModalDialog>
  );
}
