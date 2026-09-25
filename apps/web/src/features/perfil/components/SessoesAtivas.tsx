import { useState } from 'react';
import { type SessaoAtiva } from '@checkpoint/shared';
import { Icon } from '@/shared/components/Icon';
import { ModalDialog } from '@/shared/components/ModalDialog';
import { FieldError } from '@/shared/components/form-parts';
import { describeAuthError } from '@/features/auth/lib/auth-errors';
import { useEncerrarOutrasSessoes, useEncerrarSessao, useSessoes } from '../api/use-sessoes';
import { confirmacaoEncerrarOutras, iconeDoDispositivo, ultimoUso } from '../lib/sessoes';

const BUTTON =
  'min-h-11 min-w-11 shrink-0 rounded-xl px-3 font-display text-[13px] uppercase tracking-[0.1em] disabled:cursor-wait disabled:opacity-60';

function LinhaSessao({
  sessao,
  encerrando,
  onEncerrar,
}: {
  sessao: SessaoAtiva;
  encerrando: boolean;
  onEncerrar: (id: string) => void;
}) {
  return (
    <li
      data-sessao={sessao.id}
      className="flex min-w-0 items-center gap-3 rounded-xl bg-painel-2 px-3 py-2.5"
    >
      <Icon
        name={iconeDoDispositivo(sessao.dispositivo)}
        size={24}
        className="shrink-0 text-texto-suave"
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-[17px] font-semibold [overflow-wrap:anywhere]">
          {sessao.dispositivo}
        </span>
        <span className="text-[16px] text-texto-suave">{ultimoUso(sessao.ultimoUsoEm)}</span>
      </div>
      {sessao.atual ? (
        <span className="shrink-0 rounded-xl border border-destaque px-2 py-1 text-[13px] font-bold uppercase tracking-[0.08em] text-destaque">
          Este aparelho
        </span>
      ) : (
        <button
          type="button"
          onClick={() => onEncerrar(sessao.id)}
          disabled={encerrando}
          aria-label={`Encerrar sessão ${sessao.dispositivo}`}
          className={`${BUTTON} border border-borda-controle font-semibold hover:bg-acao-hover`}
        >
          Encerrar
        </button>
      )}
    </li>
  );
}

/**
 * "Sessões ativas" da seção Conta do `/perfil` (spec perfil, etapa 2), montada quando a linha de mesmo
 * nome (`id="perfil-sessoes"`, na `PerfilPage`) se expande. Uma linha por aparelho, a deste
 * primeiro com o selo "Este aparelho" e sem botão (ela se encerra pelo Sair). As outras têm Encerrar,
 * sem confirmação (quem encerrou entra de novo se quiser); "Encerrar todas as outras" pede confirmação
 * no `<dialog>` e some quando não há outras. O aparelho encerrado descobre na próxima request (401 →
 * `/login?motivo=sessao`), pelo interceptor que já existe. Erros pelo `code`.
 */
export function SessoesAtivas() {
  const { data, isPending, isError, refetch } = useSessoes();
  const encerrar = useEncerrarSessao();
  const encerrarOutras = useEncerrarOutrasSessoes();
  const [erro, setErro] = useState('');
  const [confirmando, setConfirmando] = useState(false);
  const [erroConfirmacao, setErroConfirmacao] = useState('');

  const outras = (data ?? []).filter((sessao) => !sessao.atual);

  async function onEncerrar(id: string) {
    setErro('');
    try {
      await encerrar.mutateAsync(id);
    } catch (failure) {
      setErro(describeAuthError(failure).message);
    }
  }

  async function onConfirmarOutras() {
    setErroConfirmacao('');
    try {
      await encerrarOutras.mutateAsync();
      setConfirmando(false);
    } catch (failure) {
      setErroConfirmacao(describeAuthError(failure).message);
    }
  }

  return (
    <div
      className="flex flex-col gap-3 px-4 pb-4 pt-1"
      aria-labelledby="perfil-sessoes"
      role="group"
    >
      {isPending && <p className="m-0 text-[16px] text-texto-suave">Carregando sessões…</p>}

      {isError && (
        <div className="flex flex-wrap items-center gap-3">
          <FieldError id="sessoes-erro-lista" message="Não deu para carregar as sessões." />
          <button
            type="button"
            onClick={() => void refetch()}
            className={`${BUTTON} border border-borda-controle font-semibold hover:bg-acao-hover`}
          >
            Tentar de novo
          </button>
        </div>
      )}

      {data && (
        <ul aria-label="Sessões" className="m-0 flex list-none flex-col gap-2 p-0">
          {data.map((sessao) => (
            <LinhaSessao
              key={sessao.id}
              sessao={sessao}
              encerrando={encerrar.isPending && encerrar.variables === sessao.id}
              onEncerrar={(id) => void onEncerrar(id)}
            />
          ))}
        </ul>
      )}

      {erro && <FieldError id="sessoes-erro" message={erro} />}

      {outras.length > 0 && (
        <button
          type="button"
          onClick={() => {
            setErroConfirmacao('');
            setConfirmando(true);
          }}
          className={`${BUTTON} self-start border border-erro font-semibold text-erro hover:bg-acao-hover`}
        >
          Encerrar todas as outras
        </button>
      )}

      <ModalDialog
        open={confirmando}
        onClose={() => setConfirmando(false)}
        labelledBy="encerrar-outras-titulo"
      >
        <div className="sheet-pad flex flex-col gap-5 px-7 pt-7">
          <h2
            id="encerrar-outras-titulo"
            className="m-0 font-display text-xl font-extrabold tracking-[0.12em]"
          >
            ENCERRAR SESSÕES
          </h2>
          <p className="m-0 text-[19px]">{confirmacaoEncerrarOutras(outras.length)}</p>
          <FieldError id="encerrar-outras-erro" message={erroConfirmacao} />
          <div className="flex justify-end gap-2.5">
            <button
              type="button"
              data-autofocus
              onClick={() => setConfirmando(false)}
              className="min-h-12 rounded-xl border border-borda-controle px-5 font-display text-[13px] font-semibold tracking-[0.1em] hover:bg-acao-hover"
            >
              CANCELAR
            </button>
            <button
              type="button"
              onClick={() => void onConfirmarOutras()}
              disabled={encerrarOutras.isPending}
              className="min-h-12 rounded-xl bg-erro px-[22px] font-display text-[13px] font-extrabold tracking-[0.1em] text-fundo disabled:opacity-70"
            >
              {encerrarOutras.isPending ? 'ENCERRANDO…' : 'ENCERRAR'}
            </button>
          </div>
        </div>
      </ModalDialog>
    </div>
  );
}
