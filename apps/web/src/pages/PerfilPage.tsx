import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FieldError } from '@/shared/components/form-parts';
import { UNEXPECTED_MESSAGE } from '@/features/auth/lib/auth-errors';
import { avisoDoPerfil } from '@/features/auth/lib/perfil-avisos';
import { useAuth } from '@/features/auth/session/use-auth';

const SEM_CONEXAO_PARA_SAIR = 'Sem conexão. Para sair, conecte-se.';

/**
 * `/perfil` (mínima; a spec `perfil` a expande): nome, e-mail, Trocar senha e Sair. Mostra o aviso que
 * a troca de senha deixa no `state` da navegação. Sair sem conexão NÃO acontece: o cookie `HttpOnly`
 * só o servidor apaga, e sair "só localmente" deixaria a sessão voltar no próximo carregamento. Depois
 * de sair, o `RequireAuth` leva para `/login`.
 */
export function PerfilPage() {
  const { usuario, sair } = useAuth();
  const avisoRecebido = avisoDoPerfil(useLocation().state);
  const [saindo, setSaindo] = useState(false);
  const [aviso, setAviso] = useState('');

  async function onSair() {
    setAviso('');
    setSaindo(true);
    const resultado = await sair();
    setSaindo(false);
    if (resultado === 'sem-conexao') {
      setAviso(SEM_CONEXAO_PARA_SAIR);
    } else if (resultado === 'erro') {
      setAviso(UNEXPECTED_MESSAGE);
    }
  }

  return (
    <div className="safe-x pb-12 pt-6 md:pb-16 md:pt-10">
      <main className="relative mx-auto flex max-w-[640px] flex-col gap-5">
        <h1 className="glow-text-magenta m-0 font-display text-[22px] font-extrabold tracking-[0.14em] md:text-[30px]">
          PERFIL
        </h1>

        {avisoRecebido && (
          <p
            role="status"
            className="m-0 rounded-md border border-ciano bg-painel px-4 py-3 text-[16px] font-semibold text-ciano"
          >
            {avisoRecebido}
          </p>
        )}

        <section className="flex flex-col gap-4 rounded-md border border-borda bg-painel p-5 md:p-6">
          <dl className="m-0 flex flex-col gap-3">
            <div>
              <dt className="text-sm font-bold uppercase tracking-[0.22em] text-texto-suave">
                Nome
              </dt>
              <dd className="m-0 text-[20px] font-semibold">{usuario?.nome}</dd>
            </div>
            <div>
              <dt className="text-sm font-bold uppercase tracking-[0.22em] text-texto-suave">
                E-mail
              </dt>
              <dd className="m-0 text-[20px] font-semibold">{usuario?.email}</dd>
              <dd className="m-0 text-[15px] text-texto-suave">
                (não verificado — usado só para entrar)
              </dd>
            </div>
          </dl>

          <Link
            to="/perfil/senha"
            className="flex min-h-11 items-center self-start rounded-[4px] text-[16px] font-semibold text-ciano underline underline-offset-4"
          >
            Trocar senha
          </Link>

          {aviso && <FieldError id="perfil-aviso" message={aviso} />}

          <button
            type="button"
            onClick={() => void onSair()}
            disabled={saindo}
            className="min-h-11 self-start rounded-[4px] border border-borda-controle px-5 font-display text-[13px] font-semibold uppercase tracking-[0.1em] hover:bg-acao-hover disabled:cursor-wait disabled:opacity-60"
          >
            {saindo ? 'Saindo…' : 'Sair'}
          </button>
        </section>
      </main>
    </div>
  );
}
