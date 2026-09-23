import { Icon } from '@/shared/components/Icon';

const STATE_BOX =
  'flex min-h-[180px] flex-col items-center justify-center gap-2.5 rounded-md border border-dashed border-borda bg-painel p-6 text-center';

const STATE_TITLE = 'font-display text-[15px] font-extrabold uppercase tracking-[0.12em]';

/** Carregando: três linhas de esqueleto (o brilho para com movimento reduzido). */
export function ListLoading() {
  return (
    <div
      role="status"
      aria-label="Carregando jogos"
      aria-busy="true"
      className="flex flex-col gap-2.5"
    >
      {[0, 1, 2].map((index) => (
        <div key={index} className="skeleton h-[52px] w-full rounded-md" />
      ))}
    </div>
  );
}

/** Vazio: sem jogo nenhum ou, com filtro ativo, sem jogo naquele status. */
export function ListEmpty({ filtered }: { filtered: boolean }) {
  return (
    <div className={STATE_BOX} data-state={filtered ? 'empty-filter' : 'empty'}>
      <Icon name="stadia_controller" size={40} filled className="text-ouro" />
      <div className={STATE_TITLE}>
        {filtered ? 'Nenhum jogo neste status' : 'Nenhum jogo cadastrado'}
      </div>
      <p className="m-0 text-[17px] text-texto-suave">
        {filtered
          ? 'Troque o filtro ou adicione um jogo.'
          : 'Adicione o primeiro jogo para começar.'}
      </p>
    </div>
  );
}

/** Erro ao carregar a lista, com a opção de tentar de novo (CA-50). */
export function ListError({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className={STATE_BOX} data-state="error">
      <Icon name="wifi_off" size={40} filled className="text-erro" />
      <div className={STATE_TITLE}>Não deu para carregar</div>
      <p className="m-0 text-[17px] text-texto-suave">A API não respondeu.</p>
      <button
        type="button"
        onClick={onRetry}
        className="min-h-11 rounded-[4px] border border-borda-controle px-[18px] font-display text-[13px] font-semibold tracking-[0.1em] hover:bg-acao-hover"
      >
        TENTAR DE NOVO
      </button>
    </div>
  );
}
