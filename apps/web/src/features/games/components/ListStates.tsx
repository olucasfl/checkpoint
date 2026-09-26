import { Icon } from '@/shared/components/Icon';

const STATE_BOX =
  'flex min-h-[180px] flex-col items-center justify-center gap-2.5 rounded-2xl border border-dashed border-borda bg-painel p-6 text-center';

const STATE_TITLE = 'font-display text-[15px] font-extrabold tracking-[-0.01em]';

/**
 * Carregando: o esqueleto de UMA prateleira (cartão, título e quatro capas em pé com duas linhas de texto), nas mesmas
 * medidas da `Prateleira`, para o conteúdo entrar sem mudar o layout. O pulso para com movimento reduzido.
 */
export function ListLoading() {
  return (
    <div
      role="status"
      aria-label="Carregando jogos"
      aria-busy="true"
      className="flex min-w-0 flex-col gap-4 rounded-2xl border border-borda bg-painel p-4 md:border-0 md:bg-transparent md:p-0"
    >
      <div className="skeleton h-7 w-40 rounded-full" />
      <div className="grid grid-cols-[repeat(auto-fill,132px)] justify-start gap-x-3.5 gap-y-5 md:grid-cols-[repeat(auto-fill,150px)] md:gap-x-[22px] md:gap-y-6">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="flex w-[132px] flex-col gap-2 md:w-[150px]">
            <div className="skeleton aspect-[3/4] w-full rounded-xl md:rounded-[14px]" />
            <div className="skeleton h-4 w-4/5 rounded-full" />
            <div className="skeleton h-3 w-1/2 rounded-full" />
          </div>
        ))}
      </div>
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

/**
 * Erro ao carregar a lista, com a opção de tentar de novo (CA-50). Sem conexão (`offline` ou `sem-servidor`), a causa é
 * conhecida e o texto diz que o catálogo volta com a conexão; a mensagem genérica só serve quando a
 * conexão parece boa e mesmo assim a API falhou.
 */
export function ListError({
  onRetry,
  offline = false,
}: {
  onRetry: () => void;
  offline?: boolean;
}) {
  return (
    <div role="alert" className={STATE_BOX} data-state="error">
      <Icon name="wifi_off" size={40} filled className="text-erro" />
      <div className={STATE_TITLE}>Não deu para carregar</div>
      <p className="m-0 text-[17px] text-texto-suave">
        {offline
          ? 'Sem conexão. Seu catálogo aparece quando a conexão voltar.'
          : 'A API não respondeu.'}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="min-h-11 rounded-full border border-borda-controle px-[18px] font-display text-[15px] font-bold hover:bg-acao-hover"
      >
        Tentar de novo
      </button>
    </div>
  );
}
