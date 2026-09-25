import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { FieldError } from '@/shared/components/form-parts';
import { usePrefs } from '@/shared/hooks/use-prefs';
import { UNEXPECTED_MESSAGE } from '@/features/auth/lib/auth-errors';
import { avisoDoPerfil } from '@/features/auth/lib/perfil-avisos';
import { useAuth } from '@/features/auth/session/use-auth';
import { InstalarApp } from '@/features/perfil/components/InstalarApp';
import { LinhaBotao, LinhaLink, ListaDeLinhas } from '@/features/perfil/components/LinhaConta';
import { PerfilCabecalho } from '@/features/perfil/components/PerfilCabecalho';
import {
  PreferenciasModal,
  resumoDasPreferencias,
} from '@/features/perfil/components/PreferenciasModal';
import { SessoesAtivas } from '@/features/perfil/components/SessoesAtivas';
import { ZonaDePerigo } from '@/features/perfil/components/ZonaDePerigo';

const SEM_CONEXAO_PARA_SAIR = 'Sem conexão. Para sair, conecte-se.';

/**
 * `/perfil` (spec perfil, etapas 1 a 5): uma coluna centralizada com o cabeçalho (avatar de iniciais,
 * nome editável, e-mail, "Membro desde", resumo do catálogo), a Conta em linhas (Trocar senha, Sessões
 * ativas, Sair), uma linha que abre o modal de preferências do aparelho, "Instalar app" quando dá e, no
 * fim, a Zona de perigo. Mostra o aviso que a troca de senha deixa no `state` da navegação. Sair sem
 * conexão NÃO acontece: o cookie `HttpOnly` só o servidor apaga, e sair "só localmente" deixaria a
 * sessão voltar no próximo carregamento. Depois de sair, o `RequireAuth` leva para `/login`.
 */
export function PerfilPage() {
  const { sair } = useAuth();
  const prefs = usePrefs();
  const avisoRecebido = avisoDoPerfil(useLocation().state);
  const [saindo, setSaindo] = useState(false);
  const [aviso, setAviso] = useState('');
  const [sessoesAbertas, setSessoesAbertas] = useState(false);
  const [prefsAbertas, setPrefsAbertas] = useState(false);

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
      <main className="relative mx-auto flex max-w-[640px] flex-col gap-7">
        <h1 className="glow-text-destaque m-0 font-display text-[22px] font-extrabold tracking-[0.14em] md:text-[30px]">
          PERFIL
        </h1>

        {avisoRecebido && (
          <p
            role="status"
            className="m-0 rounded-2xl bg-painel px-4 py-3 text-[16px] font-semibold text-ciano"
          >
            {avisoRecebido}
          </p>
        )}

        <PerfilCabecalho />

        <ListaDeLinhas rotulo="Conta">
          <LinhaLink to="/perfil/senha" icone="lock" rotulo="Trocar senha" />
          <LinhaBotao
            id="perfil-sessoes"
            icone="devices"
            rotulo="Sessões ativas"
            seta={sessoesAbertas ? 'expand_less' : 'expand_more'}
            aria-expanded={sessoesAbertas}
            aria-controls="perfil-sessoes-lista"
            onClick={() => setSessoesAbertas((aberta) => !aberta)}
          />
          {sessoesAbertas && (
            <div id="perfil-sessoes-lista">
              <SessoesAtivas />
            </div>
          )}
          <LinhaBotao
            icone="logout"
            rotulo={saindo ? 'Saindo…' : 'Sair'}
            seta={null}
            disabled={saindo}
            onClick={() => void onSair()}
          />
        </ListaDeLinhas>
        {aviso && <FieldError id="perfil-aviso" message={aviso} />}

        <ListaDeLinhas rotulo="Preferências">
          <LinhaBotao
            icone="tune"
            rotulo="Preferências do aparelho"
            detalhe={resumoDasPreferencias(prefs)}
            aria-haspopup="dialog"
            onClick={() => setPrefsAbertas(true)}
          />
        </ListaDeLinhas>
        <PreferenciasModal open={prefsAbertas} onClose={() => setPrefsAbertas(false)} />

        <InstalarApp />

        <ZonaDePerigo />
      </main>
    </div>
  );
}
