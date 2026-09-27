import { type ContaVinculada, type PlataformaInfo, type Provedor } from '@checkpoint/shared';
import { Icon } from '@/shared/components/Icon';
import { ModalDialog } from '@/shared/components/ModalDialog';
import { PlataformaMarca } from '@/shared/components/PlataformaMarca';
import { ResumoPlataforma } from './ResumoPlataforma';

const TITULO_ID = 'plataforma-dialogo-titulo';

interface PlataformaDialogProps {
  open: boolean;
  plataforma: PlataformaInfo;
  conta: ContaVinculada;
  onClose: () => void;
}

/** O popup de uma plataforma vinculada (`<dialog>` nativo, como os outros): cabeçalho com a logo oficial e o resumo da conta. */
export function PlataformaDialog({ open, plataforma, conta, onClose }: PlataformaDialogProps) {
  return (
    <ModalDialog open={open} onClose={onClose} labelledBy={TITULO_ID}>
      <div className="sheet-pad flex max-h-[85dvh] flex-col gap-3 overflow-y-auto px-5 pt-4">
        <div className="flex items-center justify-between gap-3">
          <h2 id={TITULO_ID} className="m-0">
            <PlataformaMarca provedor={plataforma.id as Provedor} variante="logo" />
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="grid size-11 shrink-0 place-items-center rounded-full border border-borda-controle hover:bg-acao-hover"
          >
            <Icon name="close" size={22} />
          </button>
        </div>
        <ResumoPlataforma conta={conta} />
      </div>
    </ModalDialog>
  );
}
