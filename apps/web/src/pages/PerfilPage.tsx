import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FieldError } from '@/shared/components/form-parts';
import { UNEXPECTED_MESSAGE } from '@/features/auth/lib/auth-errors';
import { avisoDoPerfil } from '@/features/auth/lib/perfil-avisos';
import { useAuth } from '@/features/auth/session/use-auth';
import { InstalarApp } from '@/features/perfil/components/InstalarApp';
import { PerfilCabecalho } from '@/features/perfil/components/PerfilCabecalho';
import { PreferenciasAparelho } from '@/features/perfil/components/PreferenciasAparelho';
import { SessoesAtivas } from '@/features/perfil/components/SessoesAtivas';

const SEM_CONEXAO_PARA_SAIR = 'Sem conexão. Para sair, conecte-se.';

/**
 * `/perfil` (spec perfil, etapas 1 a 3): cabeçalho (avatar de iniciais, nome editável, e-mail,
 * "Membro desde", resumo do catálogo), a conta (Trocar senha, Sessões ativas, Sair), "Instalar app"
 * quando dá e as preferências deste aparelho. Empilhado no celular; duas colunas em >= 1024px. Mostra o aviso que a troca de senha deixa
 * no `state` da navegação. Sair sem conexão NÃO acontece: o cookie `HttpOnly` só o servidor apaga, e sair "só
 * localmente" deixaria a sessão voltar no próximo carregamento. Depois de sair, o `RequireAuth` leva
 * para `/login`.
 */
export function PerfilPage() {
  const { sair } = useAuth();
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
      <main className="relative mx-auto flex max-w-[960px] flex-col gap-5">
        <h1 className="glow-text-destaque m-0 font-display text-[22px] font-extrabold tracking-[0.14em] md:text-[30px]">
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

        <PerfilCabecalho />

        {/* Em >= 1024px: conta (e o app) | preferências deste aparelho. */}
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-5">
            <section
              aria-labelledby="perfil-conta"
              className="flex flex-col gap-4 rounded-md border border-borda bg-painel p-5 md:p-6"
            >
              <div>
                <h2
                  id="perfil-conta"
                  className="m-0 font-display text-[15px] font-extrabold uppercase tracking-[0.14em]"
                >
                  Conta
                </h2>
                <p className="m-0 text-[15px] text-texto-suave">Salvo na sua conta</p>
              </div>

              <Link
                to="/perfil/senha"
                className="flex min-h-11 items-center self-start rounded-[4px] text-[16px] font-semibold text-ciano underline underline-offset-4"
              >
                Trocar senha
              </Link>

              <SessoesAtivas />

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

            <InstalarApp />
          </div>

          <PreferenciasAparelho />
        </div>
      </main>
    </div>
  );
}
